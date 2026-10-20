# UK ONS Labour Market Statistics official release metadata

**Pinned original publisher page:** https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/labourmarketstatistics/current

ONS Labour Market Statistics (LMS) dataset has a native release day and an announced next release day. This reader checks dataset identity, release day (as a source publication period), and calendar validity, then reports a bounded freshness age. It does not retrieve or disclose the giant 11.7MB LMS file, individual unemployment percentages, rolling-quarter observation periods, current FX prices, or paid risk intelligence.

One first-party HTTPS GET per **existing daily** GDACS/PortWatch source schedule, 2 MiB hard streaming body cap (raised from 512 KiB after real official HTML exceeded initial bound) and 12s timeout. Redirects, 401/403/429, implausible calendar days, future/too-old releases and missing official dataset identity fail closed. No raw ONS HTML or number persisted; 3-day private GitHub receipt only.

Source family is UK ONS, ISO3 GBR, domain Macro/FX. UK ONS may be treated as its own genuine first-party publisher when original article/time rights are separately verified. This dataset-release observation is NOT an independently verified same-event macro surprise, full-country commercial license, current signed score or completion of 195x3.

After merge inspect the exact-main ons-lms-national-release job: successful source-native publisher date is a green **release metadata** check only. A forbidden response remains red; do not proxy around upstream restrictions.