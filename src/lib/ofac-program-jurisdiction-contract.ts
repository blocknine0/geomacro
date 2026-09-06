export const OFAC_PROGRAM_JURISDICTION_CONTRACT_VERSION =
  "ofac-program-jurisdiction-v0.1.0" as const;


export type OfacJurisdictionCode =
  | "AFG"
  | "BLR"
  | "CHN"
  | "CAF"
  | "COD"
  | "CUB"
  | "IRN"
  | "IRQ"
  | "LBN"
  | "LBY"
  | "MLI"
  | "MMR"
  | "NIC"
  | "PRK"
  | "RUS"
  | "SDN"
  | "SOM"
  | "SSD"
  | "SYR"
  | "UKR"
  | "VEN"
  | "YEM";


export type OfacProgramAttribution =
  | {
      mode: "DIRECT_JURISDICTION";
      jurisdiction:
        OfacJurisdictionCode;
      confidence: "EXPLICIT_REVIEWED";
      scoring_status:
        "EVIDENCE_ONLY_NOT_IN_GRO_V02";
    }
  | {
      mode: "NO_DIRECT_JURISDICTION";
      reason:
        | "GLOBAL_OR_THEMATIC_PROGRAM"
        | "MULTI_JURISDICTION_PROGRAM"
        | "REQUIRES_SEPARATE_REVIEW";
      scoring_status:
        "EVIDENCE_ONLY_NOT_IN_GRO_V02";
    };


const direct = (
  jurisdiction:
    OfacJurisdictionCode,
): OfacProgramAttribution => ({
  mode:
    "DIRECT_JURISDICTION",

  jurisdiction,

  confidence:
    "EXPLICIT_REVIEWED",

  scoring_status:
    "EVIDENCE_ONLY_NOT_IN_GRO_V02",
});


const nonDirect = (
  reason:
    | "GLOBAL_OR_THEMATIC_PROGRAM"
    | "MULTI_JURISDICTION_PROGRAM"
    | "REQUIRES_SEPARATE_REVIEW",
): OfacProgramAttribution => ({
  mode:
    "NO_DIRECT_JURISDICTION",

  reason,

  scoring_status:
    "EVIDENCE_ONLY_NOT_IN_GRO_V02",
});


export const OFAC_PROGRAM_JURISDICTION_MAP:
  Readonly<
    Record<
      string,
      OfacProgramAttribution
    >
  > = {

  "561-Related":
    direct("IRN"),

  "CMIC-EO13959":
    direct("CHN"),

  "ETHIOPIA-EO14046":
    nonDirect(
      "MULTI_JURISDICTION_PROGRAM",
    ),

  "HKAA":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "HRIT-IR":
    direct("IRN"),

  "HRIT-SY":
    direct("SYR"),

  "ICC-EO14203":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),


  "BELARUS":
    direct("BLR"),

  "BELARUS-EO14038":
    direct("BLR"),

  "BURMA-EO14014":
    direct("MMR"),

  "CAR":
    direct("CAF"),

  "CUBA":
    direct("CUB"),

  "CUBA-EO14404":
    direct("CUB"),

  "DARFUR":
    direct("SDN"),

  "DPRK":
    direct("PRK"),

  "DPRK2":
    direct("PRK"),

  "DPRK3":
    direct("PRK"),

  "DPRK4":
    direct("PRK"),

  "DPRK-NKSPEA":
    direct("PRK"),

  "DRCONGO":
    direct("COD"),

  "IRAN":
    direct("IRN"),

  "IRAN-CON-ARMS-EO":
    direct("IRN"),

  "IRAN-EO13846":
    direct("IRN"),

  "IRAN-EO13871":
    direct("IRN"),

  "IRAN-EO13876":
    direct("IRN"),

  "IRAN-EO13902":
    direct("IRN"),

  "IRAN-HR":
    direct("IRN"),

  "IRAN-TRA":
    direct("IRN"),

  "IRAQ2":
    direct("IRQ"),

  "IRAQ3":
    direct("IRQ"),

  "LEBANON":
    direct("LBN"),

  "LIBYA2":
    direct("LBY"),

  "LIBYA3":
    direct("LBY"),

  "MALI-EO13882":
    direct("MLI"),

  "NICARAGUA":
    direct("NIC"),

  "NICARAGUA-NHRAA":
    direct("NIC"),

  "PAARSSR-EO13894":
    direct("SYR"),

  "RUSSIA-EO14024":
    direct("RUS"),

  "RUSSIA-EO14065":
    direct("RUS"),

  "SOMALIA":
    direct("SOM"),

  "SOUTH SUDAN":
    direct("SSD"),

  "SUDAN-EO14098":
    direct("SDN"),

  "UKRAINE-EO13660":
    direct("UKR"),

  "UKRAINE-EO13661":
    direct("UKR"),

  "UKRAINE-EO13662":
    direct("UKR"),

  "UKRAINE-EO13685":
    direct("UKR"),

  "VENEZUELA":
    direct("VEN"),

  "VENEZUELA-EO13850":
    direct("VEN"),

  "VENEZUELA-EO13884":
    direct("VEN"),

  "YEMEN":
    direct("YEM"),


  "BALKANS":
    nonDirect(
      "MULTI_JURISDICTION_PROGRAM",
    ),

  "BALKANS-EO14033":
    nonDirect(
      "MULTI_JURISDICTION_PROGRAM",
    ),

  "CAATSA - IRAN":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "CAATSA - RUSSIA":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "CYBER2":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "CYBER3":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "CYBER4":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "ELECTION-EO13848":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "FTO":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "GLOMAG":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "HOSTAGES-EO14078":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "IFCA":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "IFSR":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "ILLICIT-DRUGS-EO14059":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "IRGC":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "MAGNIT":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "NPWMD":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "NS-PLC":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "PAIPA":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "PEESA-EO14039":
    nonDirect(
      "MULTI_JURISDICTION_PROGRAM",
    ),

  "SDGT":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "SDNT":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "SDNTK":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "SSIDES":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),

  "TCO":
    nonDirect(
      "GLOBAL_OR_THEMATIC_PROGRAM",
    ),

  "UHRPA":
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    ),
};


export function getOfacProgramAttribution(
  program:
    string,
): OfacProgramAttribution {

  return (
    OFAC_PROGRAM_JURISDICTION_MAP[
      program
    ] ??
    nonDirect(
      "REQUIRES_SEPARATE_REVIEW",
    )
  );
}
