/** Canonical 195-country offline projection of the reviewed TS registry.
 * Only ORIGINAL headline mention is a candidate; not proof of rights, event,
 * independent confirmation, or commercial eligibility.
 * Do not derive event country from publisher country or URL hostname.
 */
import {countryMentionFromTitle} from "./country-news-mentions-195.mjs";
const ROWS=`AFG|AF|Afghanistan
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
const ALIASES=Object.freeze({
 PSE:["Palestine","Palestinian","Occupied Palestinian Territory","Palestinian territories","West Bank and Gaza","Gaza","West Bank"],
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
 CIV:["Ivory Coast"],MMR:["Burma"],
});
export const PHASE2H_COUNTRIES_195=Object.freeze(ROWS.trim().split("\n").map(line=>{
 const [iso3,iso2,name]=line.split("|");
 return Object.freeze({iso3,iso2,name,aliases:ALIASES[iso3]??[]});
}));
if(PHASE2H_COUNTRIES_195.length!==195||
 new Set(PHASE2H_COUNTRIES_195.map(x=>x.iso3)).size!==195||
 !PHASE2H_COUNTRIES_195.some(x=>x.iso3==="PSE")||
 !PHASE2H_COUNTRIES_195.some(x=>x.iso3==="VAT"))
 throw Error("PHASE2H_CANONICAL_COUNTRY_REGISTRY_DRIFT");

export function phase2hCountry(iso3){
 return typeof iso3==="string"&&/^[A-Z]{3}$/u.test(iso3)?
  PHASE2H_COUNTRIES_195.find(x=>x.iso3===iso3)??null:null;
}
export function phase2hHeadlineCountryCandidate(title){
 return countryMentionFromTitle(title,PHASE2H_COUNTRIES_195);
}
/** SQL is only a selective prefilter. Never accept its LIKE match as evidence:
 * every record must pass the exact canonical 195-headline resolver afterward.
 */
export function phase2hCountrySqlHints(iso3){
 const country=phase2hCountry(iso3);
 if(!country)return [];
 const phrases=[country.name,...country.aliases];
 for(const locale of ["en","bn","hi","es","fr","de","pt","ru","ar","zh","ja","ko","tr","id","sw","fa","ur","ta","te","th","vi","ms","it","nl","pl","uk"]){
  try{
   const translation=new Intl.DisplayNames([locale],{type:"region"}).of(country.iso2);
   if(translation&&translation!==country.iso2)phrases.push(translation);
  }catch{ /* use registry aliases when ICU locale unavailable */ }
 }
 return [...new Set(phrases.map(x=>x.normalize("NFKC").toLocaleLowerCase("en").trim())
  .filter(x=>x.length>=4||x.length>=2&&/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(x))
  .map(x=>x.replace(/[\\%_]/gu,"\\$&")))].slice(0,32);
}
