use std::path::Path;

use lexical_core::parse;

pub const CANCELLED_MARKER: &str = "__VTK_CANCELLED__";

#[derive(Debug)]
pub struct GalvoGeometry {
    pub folder: u8,
    pub points: Vec<f32>,
    pub lines: Vec<u32>,
}

struct TokenScanner<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> TokenScanner<'a> {
    fn new(bytes: &'a [u8], pos: usize) -> Self {
        Self { bytes, pos }
    }

    #[inline]
    fn skip_ws(&mut self) {
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
    }

    #[inline]
    fn next(&mut self) -> Result<&'a [u8], String> {
        self.skip_ws();
        let start = self.pos;
        while self.pos < self.bytes.len() && !self.bytes[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
        if start == self.pos {
            return Err("VTK 数据意外结束".into());
        }
        Ok(&self.bytes[start..self.pos])
    }

    #[inline]
    fn next_u32(&mut self) -> Result<u32, String> {
        let token = self.next()?;
        parse::<u32>(token).map_err(|_| format!("无法解析整数: {}", String::from_utf8_lossy(token)))
    }

    #[inline]
    fn next_usize(&mut self) -> Result<usize, String> {
        let token = self.next()?;
        parse::<usize>(token).map_err(|_| format!("无法解析整数: {}", String::from_utf8_lossy(token)))
    }

    #[inline]
    fn next_f32(&mut self) -> Result<f32, String> {
        let token = self.next()?;
        parse::<f32>(token).map_err(|_| format!("无法解析浮点数: {}", String::from_utf8_lossy(token)))
    }
}

fn find_token(bytes: &[u8], needle: &[u8], start: usize) -> Option<usize> {
    if needle.is_empty() || start >= bytes.len() {
        return None;
    }
    bytes[start..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|i| start + i)
}

#[inline]
fn check_cancel<F: Fn() -> bool>(should_cancel: &F) -> Result<(), String> {
    if should_cancel() {
        Err(CANCELLED_MARKER.into())
    } else {
        Ok(())
    }
}

/// 针对 cli2vtk 固定 Legacy ASCII POLYDATA 输出的高速解析器。
///
/// 第二轮优化：解析 POINTS/LINES 时每 4096 个标量检查一次取消令牌。
/// 快速拖动图层时，过时任务不再把剩余几十万个数字全部解析完。
pub fn parse_ascii_polydata_cancellable<F: Fn() -> bool>(
    folder: u8,
    path: &Path,
    bytes: &[u8],
    should_cancel: F,
) -> Result<GalvoGeometry, String> {
    check_cancel(&should_cancel)?;

    if !bytes.starts_with(b"# vtk DataFile") {
        return Err(format!("{} 不是 Legacy VTK 文件", path.display()));
    }

    let ascii_pos = find_token(bytes, b"ASCII", 0)
        .ok_or_else(|| format!("{} 不是 ASCII VTK", path.display()))?;
    let dataset_pos = find_token(bytes, b"DATASET POLYDATA", ascii_pos)
        .ok_or_else(|| format!("{} 不是 POLYDATA", path.display()))?;

    let points_pos = find_token(bytes, b"POINTS ", dataset_pos)
        .ok_or_else(|| format!("{} 缺少 POINTS", path.display()))?;

    let mut point_scanner = TokenScanner::new(bytes, points_pos);
    let keyword = point_scanner.next()?;
    if keyword != b"POINTS" {
        return Err(format!("{} POINTS 解析失败", path.display()));
    }
    let point_count = point_scanner.next_usize()?;
    let _point_type = point_scanner.next()?;

    let scalar_count = point_count
        .checked_mul(3)
        .ok_or_else(|| "POINTS 数量溢出".to_string())?;
    let mut points = Vec::with_capacity(scalar_count);
    for index in 0..scalar_count {
        if index & 4095 == 0 {
            check_cancel(&should_cancel)?;
        }
        points.push(point_scanner.next_f32()?);
    }

    let lines_pos = find_token(bytes, b"LINES ", point_scanner.pos)
        .ok_or_else(|| format!("{} 缺少 LINES", path.display()))?;

    let mut line_scanner = TokenScanner::new(bytes, lines_pos);
    if line_scanner.next()? != b"LINES" {
        return Err(format!("{} LINES 解析失败", path.display()));
    }
    let _cell_count = line_scanner.next_usize()?;
    let line_value_count = line_scanner.next_usize()?;

    let mut lines = Vec::with_capacity(line_value_count);
    for index in 0..line_value_count {
        if index & 4095 == 0 {
            check_cancel(&should_cancel)?;
        }
        lines.push(line_scanner.next_u32()?);
    }

    check_cancel(&should_cancel)?;
    Ok(GalvoGeometry { folder, points, lines })
}

pub fn parse_ascii_polydata(folder: u8, path: &Path, bytes: &[u8]) -> Result<GalvoGeometry, String> {
    parse_ascii_polydata_cancellable(folder, path, bytes, || false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_points_and_lines_and_ignores_cell_data() {
        let vtk = b"# vtk DataFile Version 2.0\ntest\nASCII\nDATASET POLYDATA\nPOINTS 3 double\n0 0 0\n1 0 0\n1 1 0\nLINES 1 4\n3 0 1 2\nCELL_DATA 1\nSCALARS P_V double 2\nLOOKUP_TABLE pColors\n370 1250\nLOOKUP_TABLE pColors 1\n1 1 1 1\n";
        let geometry = parse_ascii_polydata(6, Path::new("test.vtk"), vtk).unwrap();
        assert_eq!(geometry.folder, 6);
        assert_eq!(geometry.points, vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0]);
        assert_eq!(geometry.lines, vec![3, 0, 1, 2]);
    }

    #[test]
    fn cancellation_stops_parse() {
        let vtk = b"# vtk DataFile Version 2.0\ntest\nASCII\nDATASET POLYDATA\nPOINTS 1 double\n0 0 0\nLINES 1 2\n1 0\n";
        let error = parse_ascii_polydata_cancellable(1, Path::new("test.vtk"), vtk, || true).unwrap_err();
        assert_eq!(error, CANCELLED_MARKER);
    }
}
