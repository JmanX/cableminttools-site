import hashlib, json, struct, sys, zipfile
from pathlib import Path
apk=Path(sys.argv[1])
with zipfile.ZipFile(apk) as z:
 data=z.read('AndroidManifest.xml')
 strings=[]; manifest={}
 def u16(p): return struct.unpack_from('<H',data,p)[0]
 def u32(p): return struct.unpack_from('<I',data,p)[0]
 def length8(p):
  n=data[p];p+=1
  if n&128: n=((n&127)<<8)|data[p];p+=1
  return n,p
 p=8
 while p<len(data):
  kind,header,size=struct.unpack_from('<HHI',data,p)
  if size<8: raise ValueError('Invalid XML chunk')
  if kind==1:
   count=u32(p+8);flags=u32(p+16);base=p+u32(p+20)
   for i in range(count):
    q=base+u32(p+header+4*i)
    if flags&256:
     _,q=length8(q);n,q=length8(q);strings.append(data[q:q+n].decode('utf-8'))
    else:
     n=u16(q);q+=2
     if n&32768: n=((n&32767)<<16)|u16(q);q+=2
     strings.append(data[q:q+n*2].decode('utf-16le'))
  elif kind==258:
   name=strings[u32(p+20)]
   if name=='manifest':
    start,attrsize,count=struct.unpack_from('<HHH',data,p+24)
    for i in range(count):
     q=p+16+start+i*attrsize
     key=strings[u32(q+4)];raw=u32(q+8);kindvalue=data[q+15];value=u32(q+16)
     if raw!=0xffffffff: value=strings[raw]
     elif kindvalue==3: value=strings[value]
     manifest[key]=value
  p+=size
 names=z.namelist()
 dex=[z.read(n) for n in names if n.endswith('.dex')]
 commands={key:any(key.encode() in blob for blob in dex) for key in ('getCableMintScannerState','setCableMintZoom')}
 result={'filename':apk.name,'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'package':manifest.get('package'),'versionName':manifest.get('versionName'),'versionCode':manifest.get('versionCode'),'nativeZoomCommands':commands,'javascriptBundle':'assets/index.android.bundle' in names,'mlkitModelAssets':sum('mlkit' in n.lower() for n in names)}
 print(json.dumps(result,indent=2))
 config=json.loads((Path(__file__).resolve().parents[1]/'app.json').read_text())['expo']
 assert result['versionName']==config['version'], 'APK versionName mismatch'
 assert result['versionCode']==config['android']['versionCode'], 'APK versionCode mismatch'
 assert result['package']==config['android']['package'], 'APK package mismatch'
 assert result['filename']=='CableMint-Device-Capture-v'+config['version']+'.apk', 'APK filename mismatch'
 assert all(commands.values()), 'APK is missing native zoom commands; expo-camera must build from source'
 assert result['javascriptBundle'], 'APK is missing its JavaScript bundle'
