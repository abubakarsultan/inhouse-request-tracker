import { deflateRawSync } from 'node:zlib';
import { COLLAB_HEADERS, COLLAB_SUMMARY_HEADERS, cleanTabName, partnerTabName } from '@/lib/collaboration-core';

/** Standard ZIP archive, no npm dependency; each Google tab imports a separate CSV. */
export function csvTemplateZip(partnerName:string):Buffer {
  const partner=cleanTabName(partnerName||'Partner');
  const filenames=[
    {name:'Rankviz.csv',content:`${COLLAB_HEADERS.join(',')}\r\n`},
    {name:`${partnerTabName(partner)}.csv`,content:`${COLLAB_HEADERS.join(',')}\r\n`},
    {name:'Summary.csv',content:`${COLLAB_SUMMARY_HEADERS.join(',')}\r\n`},
  ];
  const parts:Buffer[]=[];const central:Buffer[]=[];let offset=0;
  for(const file of filenames){
    const filename=Buffer.from(file.name.replace(/[^a-zA-Z0-9 ._-]/g,'_'),'utf8');
    const data=Buffer.from('\ufeff'+file.content,'utf8');
    const packed=deflateRawSync(data);
    const crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);
    local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);
    local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
    parts.push(local,filename,packed);
    const directory=Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);
    directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);
    directory.writeUInt32LE(crc,16);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(data.length,24);
    directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
    central.push(directory,filename);
    offset+=local.length+filename.length+packed.length;
  }
  const centralLength=central.reduce((s,b)=>s+b.length,0);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(filenames.length,8);end.writeUInt16LE(filenames.length,10);
  end.writeUInt32LE(centralLength,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,...central,end]);
}
function crc32(bytes:Buffer){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
export function linksCsv(rows:Array<{created_at:string;website:string;placement_page:string;anchor:string;target_url:string;status:string;deal_ref?:string|null}>){
  const fields=(row:typeof rows[number])=>[row.created_at?.slice(0,10),row.website,row.placement_page,row.anchor,row.target_url,row.status,row.deal_ref||''];
  const csv=(item:unknown)=>`"${String(item??'').replace(/"/g,'""').replace(/^[=+@-]/,value=>`'${value}`)}"`;
  return '\ufeff'+[COLLAB_HEADERS.join(','),...rows.map(row=>fields(row).map(csv).join(','))].join('\r\n')+'\r\n';
}
