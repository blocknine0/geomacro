/**
 * Fixed 195-country query universe: 193 UN members + 2 UN observer states
 * (Holy See VAT and State of Palestine PSE).
 *
 * This is an offline COUNTRY ROUTING baseline, NOT a source licence, an
 * original-event claim, a rights receipt, an FX quote or a GRO signature.
 * The unrelated historical 250-entity jurisdiction registry stays intact.
 */
export const CANONICAL_195_VERSION="geomacro.un193-plus-two-observers.iso3.v1" as const;
const COUNTRY_ROWS=`AFG|AF|Afghanistan
AGO|AO|Angola
ALB|AL|Albania
AND|AD|Andorra
ARE|AE|United Arab Emirates
ARG|AR|Argentina
ARM|AM|Armenia
ATG|AG|Antigua and Barbuda
AUS|AU|Australia
AUT|AT|Austria
AZE|AZ|Azerbaijan
BDI|BI|Burundi
BEL|BE|Belgium
BEN|BJ|Benin
BFA|BF|Burkina Faso
BGD|BD|Bangladesh
BGR|BG|Bulgaria
BHR|BH|Bahrain
BHS|BS|Bahamas
BIH|BA|Bosnia and Herzegovina
BLR|BY|Belarus
BLZ|BZ|Belize
BOL|BO|Bolivia
BRA|BR|Brazil
BRB|BB|Barbados
BRN|BN|Brunei Darussalam
BTN|BT|Bhutan
BWA|BW|Botswana
CAF|CF|Central African Republic
CAN|CA|Canada
CHE|CH|Switzerland
CHL|CL|Chile
CHN|CN|China
CIV|CI|Côte d'Ivoire
CMR|CM|Cameroon
COD|CD|Democratic Republic of the Congo
COG|CG|Republic of the Congo
COL|CO|Colombia
COM|KM|Comoros
CPV|CV|Cabo Verde
CRI|CR|Costa Rica
CUB|CU|Cuba
CYP|CY|Cyprus
CZE|CZ|Czechia
DEU|DE|Germany
DJI|DJ|Djibouti
DMA|DM|Dominica
DNK|DK|Denmark
DOM|DO|Dominican Republic
DZA|DZ|Algeria
ECU|EC|Ecuador
EGY|EG|Egypt
ERI|ER|Eritrea
ESP|ES|Spain
EST|EE|Estonia
ETH|ET|Ethiopia
FIN|FI|Finland
FJI|FJ|Fiji
FRA|FR|France
FSM|FM|Federated States of Micronesia
GAB|GA|Gabon
GBR|GB|United Kingdom
GEO|GE|Georgia
GHA|GH|Ghana
GIN|GN|Guinea
GMB|GM|Gambia
GNB|GW|Guinea-Bissau
GNQ|GQ|Equatorial Guinea
GRC|GR|Greece
GRD|GD|Grenada
GTM|GT|Guatemala
GUY|GY|Guyana
HND|HN|Honduras
HRV|HR|Croatia
HTI|HT|Haiti
HUN|HU|Hungary
IDN|ID|Indonesia
IND|IN|India
IRL|IE|Ireland
IRN|IR|Iran
IRQ|IQ|Iraq
ISL|IS|Iceland
ISR|IL|Israel
ITA|IT|Italy
JAM|JM|Jamaica
JOR|JO|Jordan
JPN|JP|Japan
KAZ|KZ|Kazakhstan
KEN|KE|Kenya
KGZ|KG|Kyrgyzstan
KHM|KH|Cambodia
KIR|KI|Kiribati
KNA|KN|Saint Kitts and Nevis
KOR|KR|South Korea
KWT|KW|Kuwait
LAO|LA|Laos
LBN|LB|Lebanon
LBR|LR|Liberia
LBY|LY|Libya
LCA|LC|Saint Lucia
LIE|LI|Liechtenstein
LKA|LK|Sri Lanka
LSO|LS|Lesotho
LTU|LT|Lithuania
LUX|LU|Luxembourg
LVA|LV|Latvia
MAR|MA|Morocco
MCO|MC|Monaco
MDA|MD|Moldova
MDG|MG|Madagascar
MDV|MV|Maldives
MEX|MX|Mexico
MHL|MH|Marshall Islands
MKD|MK|North Macedonia
MLI|ML|Mali
MLT|MT|Malta
MMR|MM|Myanmar
MNE|ME|Montenegro
MNG|MN|Mongolia
MOZ|MZ|Mozambique
MRT|MR|Mauritania
MUS|MU|Mauritius
MWI|MW|Malawi
MYS|MY|Malaysia
NAM|NA|Namibia
NER|NE|Niger
NGA|NG|Nigeria
NIC|NI|Nicaragua
NLD|NL|Netherlands
NOR|NO|Norway
NPL|NP|Nepal
NRU|NR|Nauru
NZL|NZ|New Zealand
OMN|OM|Oman
PAK|PK|Pakistan
PAN|PA|Panama
PER|PE|Peru
PHL|PH|Philippines
PLW|PW|Palau
PNG|PG|Papua New Guinea
POL|PL|Poland
PRK|KP|North Korea
PRT|PT|Portugal
PRY|PY|Paraguay
PSE|PS|State of Palestine
QAT|QA|Qatar
ROU|RO|Romania
RUS|RU|Russia
RWA|RW|Rwanda
SAU|SA|Saudi Arabia
SDN|SD|Sudan
SEN|SN|Senegal
SGP|SG|Singapore
SLB|SB|Solomon Islands
SLE|SL|Sierra Leone
SLV|SV|El Salvador
SMR|SM|San Marino
SOM|SO|Somalia
SRB|RS|Serbia
SSD|SS|South Sudan
STP|ST|São Tomé and Príncipe
SUR|SR|Suriname
SVK|SK|Slovakia
SVN|SI|Slovenia
SWE|SE|Sweden
SWZ|SZ|Eswatini
SYC|SC|Seychelles
SYR|SY|Syria
TCD|TD|Chad
TGO|TG|Togo
THA|TH|Thailand
TJK|TJ|Tajikistan
TKM|TM|Turkmenistan
TLS|TL|Timor-Leste
TON|TO|Tonga
TTO|TT|Trinidad and Tobago
TUN|TN|Tunisia
TUR|TR|Türkiye
TUV|TV|Tuvalu
TZA|TZ|Tanzania
UGA|UG|Uganda
UKR|UA|Ukraine
URY|UY|Uruguay
USA|US|United States
UZB|UZ|Uzbekistan
VAT|VA|Holy See
VCT|VC|Saint Vincent and the Grenadines
VEN|VE|Venezuela
VNM|VN|Vietnam
VUT|VU|Vanuatu
WSM|WS|Samoa
YEM|YE|Yemen
ZAF|ZA|South Africa
ZMB|ZM|Zambia
ZWE|ZW|Zimbabwe`;
export type Country195=Readonly<{
 iso3:string;iso2:string;name:string;aliases:readonly string[];
 observer_state:boolean;
}>;
const EXACT_ALIASES:Readonly<Record<string,readonly string[]>>=Object.freeze({
 PSE:["Palestine","Palestinian","Occupied Palestinian Territory","West Bank and Gaza"],
 VAT:["Vatican City","Vatican","Holy See"],
 USA:["United States of America","U.S.A."],
 GBR:["Britain","Great Britain","U.K.","UK"],
 RUS:["Russian Federation"], IRN:["Islamic Republic of Iran"],
 KOR:["Republic of Korea"],PRK:["Democratic People's Republic of Korea"],
 COD:["DR Congo","DRC","Congo-Kinshasa"],
 COG:["Congo-Brazzaville"],
 CZE:["Czech Republic"],SWZ:["Swaziland"],TUR:["Turkey"],
 LAO:["Lao PDR"],VNM:["Viet Nam"],TZA:["United Republic of Tanzania"],
 MDA:["Republic of Moldova"],VEN:["Bolivarian Republic of Venezuela"],
 BOL:["Plurinational State of Bolivia"],FSM:["Micronesia"],
 BRN:["Brunei"],CPV:["Cape Verde"],MKD:["Macedonia"],
 TLS:["East Timor"],SYR:["Syrian Arab Republic"],
});
export const COUNTRIES_195:readonly Country195[]=Object.freeze(
 COUNTRY_ROWS.trim().split(String.fromCharCode(10)).map(s=>{
  const [iso3,iso2,name]=s.split("|");
  return Object.freeze({iso3,iso2,name,aliases:EXACT_ALIASES[iso3]??[],
    observer_state:iso3==="VAT"||iso3==="PSE"});
 }));
const byIso3=new Map(COUNTRIES_195.map(c=>[c.iso3,c]));
const byIso2=new Map(COUNTRIES_195.map(c=>[c.iso2,c]));
if(COUNTRIES_195.length!==195||byIso3.size!==195||byIso2.size!==195||
   COUNTRIES_195.filter(c=>c.observer_state).length!==2 ||
   !byIso3.has("PSE")||!byIso3.has("VAT"))
 throw Error("CANONICAL_195_COUNTRY_REGISTRY_CORRUPT");
/** Do not accept unknown three-letter strings as countries. */
export function country195ByIso3(iso3:string):Country195|null {
 if(typeof iso3!=="string"||!/^[A-Z]{3}$/u.test(iso3))return null;
 return byIso3.get(iso3)??null;
}
export function country195ByIso2(iso2:string):Country195|null {
 if(typeof iso2!=="string"||!/^[A-Z]{2}$/u.test(iso2))return null;
 return byIso2.get(iso2)??null;
}
