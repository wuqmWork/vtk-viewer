use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform2D {
    pub a: f64,
    pub b: f64,
    pub tx: f64,
    pub ty: f64,
    pub rotation_deg: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct GalvoDefinition {
    pub folder: u8,
    pub id: &'static str,
    pub transform: Transform2D,
}

pub const GALVOS: [GalvoDefinition; 24] = [
    GalvoDefinition { folder: 1, id: "A3", transform: Transform2D { a: 0.99998174012927299, b: 0.0060431289934185463, tx: -1033.4416300264691, ty: 2.583861688069188, rotation_deg: 0.34624789385918342 } },
    GalvoDefinition { folder: 2, id: "D1", transform: Transform2D { a: -0.99999977206421009, b: 0.00067518258781268218, tx: 256.55168422156493, ty: -283.58954160421831, rotation_deg: 179.9613148843784 } },
    GalvoDefinition { folder: 3, id: "B0", transform: Transform2D { a: 0.99999713796080292, b: -0.0023925029158758269, tx: -775.95769978706323, ty: -1.395919792869335, rotation_deg: -0.1370804503289936 } },
    GalvoDefinition { folder: 4, id: "A2", transform: Transform2D { a: -0.99999984024496102, b: -0.00056525220310745742, tx: -1036.376921819656, ty: -283.83906270497312, rotation_deg: -179.96761343267681 } },
    GalvoDefinition { folder: 5, id: "F1", transform: Transform2D { a: -0.99999189153959867, b: 0.004027015651152043, tx: 1310.8660082704789, ty: -271.50260745804093, rotation_deg: 179.76926837552949 } },
    GalvoDefinition { folder: 6, id: "C3", transform: Transform2D { a: 1.0, b: 0.0, tx: 0.0, ty: 0.0, rotation_deg: 0.0 } },
    GalvoDefinition { folder: 7, id: "B2", transform: Transform2D { a: -0.9999996590558019, b: -0.00082576526939300303, tx: -511.75555277219451, ty: -283.24332208276752, rotation_deg: -179.95268712981829 } },
    GalvoDefinition { folder: 8, id: "E3", transform: Transform2D { a: 0.99997961829008375, b: 0.0063845911707629934, tx: 1043.2597487851649, ty: 6.5240262564592157, rotation_deg: 0.36581261330010828 } },
    GalvoDefinition { folder: 9, id: "E1", transform: Transform2D { a: -0.99999797027638138, b: -0.0020148059746830441, tx: 785.63961440381161, ty: -267.81870312033197, rotation_deg: -179.8845600430092 } },
    GalvoDefinition { folder: 10, id: "C2", transform: Transform2D { a: -0.99999993400505827, b: -0.00036330411399829692, tx: -0.22098119386723389, ty: -273.51013555718953, rotation_deg: -179.9791842071302 } },
    GalvoDefinition { folder: 11, id: "C1", transform: Transform2D { a: -0.99999955093187787, b: 0.00094770039673493375, tx: -258.60700000331218, ty: -280.23362205496971, rotation_deg: 179.94570075889621 } },
    GalvoDefinition { folder: 12, id: "B1", transform: Transform2D { a: -0.99999556481237195, b: -0.0029783142187484691, tx: -769.56916737682445, ty: -281.35945649319478, rotation_deg: -179.82935491292079 } },
    GalvoDefinition { folder: 13, id: "E2", transform: Transform2D { a: -0.9999961444061346, b: -0.0027768998656788409, tx: 1049.04361740032, ty: -270.05562946395162, rotation_deg: -179.84089515308489 } },
    GalvoDefinition { folder: 14, id: "B3", transform: Transform2D { a: 0.99999913745067648, b: 0.00131342982412118, tx: -516.2560407344547, ty: 0.12131647524448461, rotation_deg: 0.075254007245519228 } },
    GalvoDefinition { folder: 15, id: "C0", transform: Transform2D { a: 0.99998327327943815, b: 0.0057838707921341413, tx: -256.88592769515787, ty: 4.1348596974060969, rotation_deg: 0.33139323334767179 } },
    GalvoDefinition { folder: 16, id: "E0", transform: Transform2D { a: 0.99999703910633231, b: 0.0024334704780997378, tx: 787.169591814093, ty: 4.2582413808323789, rotation_deg: 0.13942772557504809 } },
    GalvoDefinition { folder: 17, id: "F2", transform: Transform2D { a: -0.9999995166099187, b: -0.00098324967732104761, tx: 1569.064395053236, ty: -267.7761733783222, rotation_deg: -179.94366393420449 } },
    GalvoDefinition { folder: 18, id: "F3", transform: Transform2D { a: 0.99999654178287845, b: 0.0026299091777155321, tx: 1557.68874671456, ty: 8.2965474443940188, rotation_deg: 0.15068287008388789 } },
    GalvoDefinition { folder: 19, id: "D0", transform: Transform2D { a: 0.99999995284909082, b: -0.00030708600592276779, tx: 270.66263883394021, ty: 2.5374281194257291, rotation_deg: -0.017594732363439881 } },
    GalvoDefinition { folder: 20, id: "F0", transform: Transform2D { a: 0.99999974032732408, b: 0.00072065614751369112, tx: 1301.713948484912, ty: 8.0825600155433666, rotation_deg: 0.04129055930670187 } },
    GalvoDefinition { folder: 21, id: "D2", transform: Transform2D { a: -0.99997619361230261, b: -0.0069001600452254577, tx: 520.97461641614268, ty: -272.35756669965662, rotation_deg: -179.60464681412839 } },
    GalvoDefinition { folder: 22, id: "A0", transform: Transform2D { a: 0.99993051003624911, b: 0.01178877002260827, tx: -1294.7501113838171, ty: -3.1097738211275741, rotation_deg: 0.67546241397116902 } },
    GalvoDefinition { folder: 23, id: "A1", transform: Transform2D { a: -0.99999971725428538, b: 0.00075199158829593045, tx: -1293.5377642499241, ty: -283.48515919311848, rotation_deg: 179.95691405170049 } },
    GalvoDefinition { folder: 24, id: "D3", transform: Transform2D { a: 0.99999692665960493, b: 0.002479248140797571, tx: 527.16870567796366, ty: 8.0829845954097657, rotation_deg: 0.1420506003566695 } },
];
