"""Print actual native test results; never present the camera test double as hardware evidence."""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
suites=[]
for path in Path(sys.argv[1]).rglob('TEST-*CableMint*.xml'):
    suites.append(ET.parse(path).getroot())
cases=[case for suite in suites for case in suite.findall('testcase')]
assert len(cases)==12, f'Expected 12 native scanner/CameraControl tests, found {len(cases)}'
assert all(case.find('failure') is None and case.find('error') is None and case.find('skipped') is None for case in cases)
for case in cases: print('PASS', case.attrib['classname']+'.'+case.attrib['name'])
output='\n'.join(suite.findtext('system-out','') for suite in suites)
assert 'AUTOMATIC CameraControl.setZoomRatio requested=1.12' in output
assert 'AUTOMATIC CameraControl.setZoomRatio requested=1.24' in output
assert 'AUTOMATIC CameraControl acknowledgement actual=1.24 result=applied' in output
print(output.strip())
print('Evidence: production CameraControl operation invoked without manual input, with a test-double camera. Optical / physical-device validation remains required.')
