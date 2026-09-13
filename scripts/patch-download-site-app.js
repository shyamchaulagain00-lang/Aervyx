const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\aervyx-download-site\\src\\App.tsx';
let s = fs.readFileSync(p, 'utf8');

const providersBlock = `<section className="providers">
          <div className="section-label"><span /> DOWNLOAD FROM <span /></div>
          <h2>Choose your provider.</h2>
          <p>Same Aervyx build. Different mirrors, depending on what works best for you.</p>
          <div className="provider-grid">
            {DOWNLOAD_PROVIDER_LIST.map((provider) => (
              <a key={provider.name} className="provider-card" href={provider.url} target="_blank" rel="noopener noreferrer">
                <div className="provider-name">{provider.name}</div>
                <div className="provider-meta">{provider.url.startsWith('PLACEHOLDER') ? 'Placeholder link' : 'Available'}</div>
              </a>
            ))}
          </div>
        </section>
`;

// Find the CTA section opening and insert before it
const ctaMarker = '<section className="cta">';
if (!s.includes('section-label"><span /> DOWNLOAD FROM')) {
  if (s.includes(ctaMarker)) {
    s = s.replace(ctaMarker, providersBlock + ctaMarker);
    fs.writeFileSync(p, s, 'utf8');
    console.log('providers block inserted');
  } else {
    console.log('cta marker not found');
  }
} else {
  console.log('providers already present');
}
