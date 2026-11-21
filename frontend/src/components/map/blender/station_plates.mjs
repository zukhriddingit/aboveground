/* Assemble photo/model comparisons from native Cycles renders. Photos stay in design/. */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const root = path.resolve(import.meta.dirname, "../../../../..");
const ref = path.join(root, "design/reference");
const out = path.join(root, "design/blender");
const temp = process.argv[2];
const ink = "#e7e5de", muted = "#97a6aa", bg = "#18242e";
const escape = s => s.replaceAll("&", "&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
function label(text, width, height, size, color = ink) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="0" y="${Math.ceil(size*1.05)}" font-family="Helvetica, sans-serif" font-size="${size}" fill="${color}">${escape(text)}</text></svg>`);
}
function canvas(width,height) { return sharp({create:{width,height,channels:3,background:bg}}); }
async function panel(file,width,height) {
  return sharp(file).rotate().resize(width,height,{fit:"contain",background:bg}).png().toBuffer();
}
async function run() {
  const stations = JSON.parse(await fs.readFile(path.join(temp,"plates.json"),"utf8"));
  const credits = await fs.readFile(path.join(ref,"CREDITS.md"),"utf8");
  const gallery = [];
  for (const [i,s] of stations.entries()) {
    const folder=path.join(ref,s.id);
    const photo=(await fs.readdir(folder)).find(f=>f.startsWith(String(s.photo).padStart(2,"0")+"-"));
    const source=credits.split("\n").find(l=>l.includes("`"+photo+"`"));
    const match=source.match(/\]\([^)]+\), (.+?), (CC BY(?:-SA)? [\d.]+)/);
    const title=source.match(/: \[(.+?)\]\(/)[1];
    const credit=match[1]+"  ·  "+match[2]+"  ·  Wikimedia Commons";
    const hero=path.join(temp,s.id+".png"), site=path.join(temp,s.id+"-site.png");
    const parts=[
      {input:label(s.title,930,44,32),left:24,top:12},
      {input:label("Reference photograph",630,27,17,muted),left:24,top:65},
      {input:label("Model from corresponding viewpoint",630,27,17,muted),left:696,top:65},
      {input:await panel(path.join(folder,photo),654,438),left:22,top:98},
      {input:await panel(hero,654,438),left:694,top:98},
      {input:label(title,890,36,17),left:24,top:565},
      {input:label(credit,900,34,16,muted),left:24,top:603},
      {input:label(s.detail,310,26,17,muted),left:694,top:552},
      {input:label("Station layout",302,26,17,muted),left:1034,top:552},
      {input:await panel(path.join(temp,s.id+"-detail.png"),318,174),left:694,top:584},
      {input:await panel(site,314,174),left:1034,top:584}
    ];
    await canvas(1370,780).composite(parts).jpeg({quality:84,mozjpeg:true}).toFile(path.join(out,"compare_"+s.id+".jpg"));
    const x=18+(i%2)*624, y=75+Math.floor(i/2)*384;
    gallery.push({input:await panel(hero,602,330),left:x,top:y},
                 {input:label(s.title,590,40,25),left:x+3,top:y+332});
  }
  gallery.push({input:label("MBTA station architecture",1200,49,36),left:20,top:11});
  await canvas(1260,1615).composite(gallery).jpeg({quality:84,mozjpeg:true}).toFile(path.join(out,"stations_preview.jpg"));
}
run().catch(err=>{console.error(err);process.exitCode=1});
