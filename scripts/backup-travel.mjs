import {constants} from 'node:fs';
import {copyFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';

const target=process.argv[2];
if(!target)throw Error('Usage: node --env-file-if-exists=.env scripts/backup-travel.mjs BACKUP_DIRECTORY');
const source=resolve(process.env.TRAVEL_LINK_DATA_DIR||'.travel-link');
const output=resolve(target);
const key=join(source,'profile.key');
const keyInfo=await stat(key).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
if(keyInfo&&(!keyInfo.isFile()||keyInfo.size!==32))throw Error('Invalid profile.key.');
const database=new DatabaseSync(join(source,'travel.sqlite'),{readOnly:true});
try{
  const tables=database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='traveler_profile'").get();
  if(!keyInfo&&tables&&database.prepare('SELECT 1 FROM traveler_profile LIMIT 1').get())
    throw Error('A matching 32-byte profile.key is required for this database.');
  await mkdir(output,{mode:0o700});
  await backup(database,join(output,'travel.sqlite'));
  if(keyInfo)await copyFile(key,join(output,'profile.key'),constants.COPYFILE_EXCL);
  console.log(keyInfo?'Travel database and profile key backed up.':'Travel database backed up. No profile key has been created.');
}finally{database.close();}
