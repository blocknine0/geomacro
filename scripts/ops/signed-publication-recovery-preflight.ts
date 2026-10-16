import {mkdirSync,writeFileSync} from 'node:fs';
import {signedPublicationRecoveryPreflight} from '../../src/lib/signed-publication-recovery-preflight.server';

const receipt=signedPublicationRecoveryPreflight(process.env);
mkdirSync('artifacts/public-serving',{recursive:true});
writeFileSync('artifacts/public-serving/recovery-preflight.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(receipt));
if(!receipt.configuration_preflight_passed)process.exitCode=2;
