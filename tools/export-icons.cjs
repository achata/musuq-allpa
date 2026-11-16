// Lossless PNG decoding and area resampling for browser icon packaging; no image redraw.
const fs=require('node:fs'),zlib=require('node:zlib');
const source=fs.readFileSync('assets-source/neugrac-icon.png');
const width=source.readUInt32BE(16),height=source.readUInt32BE(20),type=source[25];
if(source[24]!==8 || ![2,6].includes(type) || source[28]!==0)throw Error('Expected noninterlaced 8-bit RGB/RGBA PNG');
const channels=type===6?4:3,parts=[];
for(let at=8;at<source.length;){const length=source.readUInt32BE(at),name=source.toString('ascii',at+4,at+8);if(name==='IDAT')parts.push(source.subarray(at+8,at+8+length));at+=length+12;}
const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*channels,pixels=Buffer.alloc(height*stride);
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const a=x>=channels?pixels[y*stride+x-channels]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;const v=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):NaN;if(!Number.isFinite(v))throw Error('PNG filter');pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+v)&255;}}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(name,bytes){const text=Buffer.from(name),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);text.copy(out,4);bytes.copy(out,8);let crc=0xffffffff;for(const b of Buffer.concat([text,bytes]))crc=crcTable[(crc^b)&255]^(crc>>>8);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;}
function png(size){const resized=Buffer.alloc(size*(size*4+1)),stepX=width/size,stepY=height/size;for(let y=0;y<size;y++)for(let x=0;x<size;x++){let alpha=0,r=0,g=0,b=0,area=0;const left=x*stepX,right=(x+1)*stepX,top=y*stepY,bottom=(y+1)*stepY;for(let sy=Math.floor(top);sy<Math.ceil(bottom);sy++)for(let sx=Math.floor(left);sx<Math.ceil(right);sx++){const weight=(Math.min(right,sx+1)-Math.max(left,sx))*(Math.min(bottom,sy+1)-Math.max(top,sy));const p=(sy*width+sx)*channels,a=(channels===4?pixels[p+3]:255)/255;area+=weight;alpha+=weight*a;r+=pixels[p]*weight*a;g+=pixels[p+1]*weight*a;b+=pixels[p+2]*weight*a;}const out=y*(size*4+1)+1+x*4;resized[out]=alpha?r/alpha:0;resized[out+1]=alpha?g/alpha:0;resized[out+2]=alpha?b/alpha:0;resized[out+3]=Math.round(alpha/area*255);}
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(resized)),chunk('IEND',Buffer.alloc(0))]);}
const sizes=[16,32,48,64],images=sizes.map(png),iconHeader=Buffer.alloc(6+16*sizes.length);iconHeader.writeUInt16LE(1,2);iconHeader.writeUInt16LE(sizes.length,4);let offset=iconHeader.length;
sizes.forEach((size,i)=>{const at=6+16*i;iconHeader[at]=iconHeader[at+1]=size;iconHeader.writeUInt16LE(1,at+4);iconHeader.writeUInt16LE(32,at+6);iconHeader.writeUInt32LE(images[i].length,at+8);iconHeader.writeUInt32LE(offset,at+12);offset+=images[i].length;});
fs.writeFileSync('data/brand/favicon.ico',Buffer.concat([iconHeader,...images]));fs.writeFileSync('data/brand/favicon-32.png',images[1]);fs.writeFileSync('data/brand/apple-touch-icon.png',png(180));
console.log('Exported transparent browser icons from the extracted mascot.');
