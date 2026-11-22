import {resolve} from 'node:path';
import {createApiUsage} from '../api-usage.mjs';

const action=process.argv[2];
if(!['status','pause','resume'].includes(action))throw Error('Use status, pause or resume.');
const usage=createApiUsage(resolve(process.env.TRAVEL_LINK_DATA_DIR||'.travel-link'));
try{
  if(action!=='status')usage[action]();
  console.log(JSON.stringify({pausedByEnvironment:usage.paused,stop:usage.status()}));
}finally{usage.close();}
