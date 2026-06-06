import fs from 'fs';
import https from 'https';

const id = '1jkUnYmFGAfBEIfuI3TeP24hOmKHCsUDf';
const url = `https://drive.google.com/uc?export=download&id=${id}`;

https.get(url, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  if (res.statusCode === 302 || res.statusCode === 303) {
     console.log('Redirect location:', res.headers.location);
     https.get(res.headers.location, (res2) => {
         console.log('Followed redirect Status:', res2.statusCode);
         const chunks = [];
         res2.on('data', d => chunks.push(d));
         res2.on('end', () => console.log('Downloaded size:', Buffer.concat(chunks).length));
     });
  }
});
