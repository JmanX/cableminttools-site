// Deliver an aligned, versioned copy; preserve the build system's original output.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const config=require(path.join(root,'app.json')).expo;
const version=config.version,code=config.android.versionCode;
if(!/^\d+\.\d+\.\d+$/.test(version)||!Number.isInteger(code)||code<1)throw Error('Invalid Android release version.');
if(require(path.join(root,'package.json')).version!==version)throw Error('Expo and package versions must align.');
const output=path.join(root,'android/app/build/outputs/apk/release');
const metadata=JSON.parse(fs.readFileSync(path.join(output,'output-metadata.json'),'utf8'));
const apk=metadata.elements.find(e=>e.outputFile==='app-release.apk');
if(!apk || apk.versionName!==version || apk.versionCode!==code)throw Error('Native APK metadata does not match Expo version/versionCode.');
const filename='CableMint-Device-Capture-v'+version+'.apk',target=path.join(output,filename);
fs.copyFileSync(path.join(output,apk.outputFile),target,fs.constants.COPYFILE_EXCL);
const sha256=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
console.log(JSON.stringify({version,versionCode:code,filename,path:target,sha256},null,2));
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'version='+version+'\nfilename='+filename+'\npath=device-capture/android/app/build/outputs/apk/release/'+filename+'\n');
