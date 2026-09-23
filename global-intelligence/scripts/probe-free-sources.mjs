const probes=[
 {id:"world_bank_indicators",category:"MACRO",url:"https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.CD?format=json&mrv=1",json:true},
 {id:"gdelt_v2",category:"GEOPOLITICS",url:"https://api.gdeltproject.org/api/v2/doc/doc?query=country:IN&mode=ArtList&format=json&maxrecords=1",json:true},
 {id:"imf_datamapper",category:"MACRO",url:"https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/IND",json:true},
 {id:"eurostat",category:"MACRO",url:"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_pjan?geo=DE&sex=T&age=TOTAL",json:true},
 {id:"usgs_mcs",category:"CRITICAL_MINERALS",url:"https://www.usgs.gov/centers/national-minerals-information-center/data",json:false}
];
for(const p of probes){
  const started=Date.now();
  try{
    const res=await fetch(p.url,{redirect:"follow"});
    const body=await res.text();
    if(!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0,300)}`);
    if(p.json) JSON.parse(body);
    console.log(JSON.stringify({source_id:p.id,category:p.category,status:"PASS",http_status:res.status,latency_ms:Date.now()-started}));
  }catch(e){
    console.log(JSON.stringify({source_id:p.id,category:p.category,status:"FAIL",latency_ms:Date.now()-started,error:String(e.message)}));
  }
}
