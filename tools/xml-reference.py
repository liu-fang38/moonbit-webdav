"""Generate independent infoset expectations with Python's stdlib ElementTree.
Run from the repository root; no third-party packages or network required.
DTD cases are a deliberate client limitation, not an ElementTree comparison.
"""
from pathlib import Path
import hashlib, json, random, sys
import xml.etree.ElementTree as ET

def expanded(tag):
    if tag.startswith('{'): return tag[1:].split('}',1)
    return '',tag

def node(element):
    uri,name=expanded(element.tag)
    content=[]
    if element.text: content.append(element.text)
    for child in element:
        content.append(node(child))
        if child.tail: content.append(child.tail)
    return {'uri':uri,'name':name,'attributes':[dict(zip(['uri','name','value'],[*expanded(k),v])) for k,v in element.attrib.items()],'content':content}

valid=[
    '<r/>', '<r>before<b/>after<c>nested</c>end</r>',
    '<?xml version="1.0"?><r a="&lt;&gt;&amp;&quot;&apos;">&#x1F600;&#65;</r>',
    '<r xmlns="u" xmlns:p="v"><p:x a="1" p:a="2" xmlns:p="w"/><z xmlns=""/></r>',
    '<r xml:lang="zh">a<!-- ignored -->b<?instruction ignored?>c<![CDATA[<raw>&]]>d</r>',
    '<r a="a\r\nb\tc&#9;&#10;&#13;">a\r\nb\rc</r>',
    '\ufeff<?xml version="1.0" encoding="UTF-8" standalone="yes"?><中文 属性="好">世界</中文>',
    '<r xmlns:p="u"><x xmlns:p="v"><p:y/></x><p:z/></r>',
    '<xml:r xml:space="preserve"/>',
    '<r>&#9;&#10;&#13;&#32;&#xD7FF;&#xE000;&#xFFFD;&#x10000;&#x10FFFF;</r>',
]
random.seed(4918)
for i in range(120):
    n=random.randint(1,6)
    value=''.join(random.choice(['x','中','&amp;','&#13;','&#x1F600;','<![CDATA[<&]]>']) for _ in range(n))
    valid.append(f'<r xmlns="urn:{i}" xmlns:p="urn:attribute" p:a="{i}" plain="&#9;">{value}<p:x xmlns:p="urn:child" xml:lang="en"/>tail</r>')

invalid=['<r>','<r/><x/>','<r a="1"a="2"/>','<r a="1" a="2"/>','<r p:a="1"/>','<r>&bogus;</r>',
    '<r>&#0;</r>','<r>&#xD800;</r>','<r>&#x110000;</r>','<r a="<"/>','<r>]]></r>',
    '<r><!-- a--b --></r>','<1r/>','<r><x></r>','<?xml version="&#49;.0"?><r/>',
    '<r xmlns:p="u" xmlns:q="u" p:a="1" q:a="2"/>','<r xmlns:xml="wrong"/>',
    '<r xmlns:p="http://www.w3.org/XML/1998/namespace"/>','<r xmlns:p=""/>','<r>\x01</r>']
cases=[{'source':s,'root':node(ET.fromstring(s))} for s in valid]
for source in invalid:
    try: ET.fromstring(source)
    except ET.ParseError: cases.append({'source':source,'rejected':True})
    else: raise AssertionError('Bad negative case: '+source)
value={'oracle':'Python stdlib xml.etree.ElementTree','python':sys.version,'cases':cases,'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
Path('evidence/xml-reference-vectors.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
print(f'Generated {len(valid)} valid + {len(invalid)} invalid independent XML vectors')
