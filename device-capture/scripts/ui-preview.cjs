// Development-only preview: real React Native screens, synthetic native/network adapters.
// Nothing from this directory is imported by App.tsx or shipped in the Android bundle.
const esbuild=require('esbuild'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=path.join(root,'web-build');fs.mkdirSync(out,{recursive:true});
const aliases={
 'react-native':'react-native-web', '@react-native-async-storage/async-storage':'storage',
 'expo-crypto':'crypto','expo-camera':'camera','expo-file-system':'files','expo-image-picker':'picker',
 './NativeZoomCamera':'camera','../modules/cablemint-ocr/src/CableMintOcrModule':'ocr','./supabase':'service','./deviceService':'service','./gapService':'gaps','./gapEvidence':'gaps',
};
esbuild.build({entryPoints:[path.join(__dirname,'ui-preview','entry.tsx')],outfile:path.join(out,'preview.js'),bundle:true,mainFields:['browser','module','main'],resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},loader:{'.png':'file'},plugins:[{name:'preview-adapters',setup(build){build.onResolve({filter:/.*/},args=>{const adapter=aliases[args.path];if(!adapter)return;if(adapter==='react-native-web')return {path:require.resolve(adapter)};return {path:path.join(__dirname,'ui-preview',adapter+'.tsx')};});}}]}).then(()=>{
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><title>CableMint native UI preview</title><style>html,body{margin:0;background:#d8e2e7;font-family:system-ui}*{box-sizing:border-box}#root{min-height:100vh}button,input{font:inherit}</style><div id="root"></div><script src="preview.js"></script></html>');
 http.createServer((req,res)=>{const file=path.join(out,req.url==='/'?'index.html':path.basename(req.url.split('?')[0]));if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));}).listen(8130,'127.0.0.1',()=>console.log('Native UI preview: http://127.0.0.1:8130'));
}).catch(e=>{console.error(e);process.exitCode=1;});
