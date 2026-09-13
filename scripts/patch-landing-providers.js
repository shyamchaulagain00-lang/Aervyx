const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src\\Landing.tsx';
let s = fs.readFileSync(p, 'utf8');

const PROVIDER_SECTION = `
        <section className="providers-section" aria-label="Download providers">
          <div className="section-kicker"><span /> DOWNLOAD FROM</div>
          <h2>Choose your provider.</h2>
          <p className="section-lead">Same Aervyx build. Different mirrors, depending on what works best for you.</p>
          <div className="provider-grid">
            {DOWNLOAD_PROVIDER_LIST.map((provider) => (
              <a key={provider.name} className="provider-card" href={provider.url} target="_blank" rel="noopener noreferrer">
                <div className="provider-name">{provider.name}</div>
                <div className="provider-status">{provider.url.startsWith('PLACEHOLDER') ? 'Placeholder link' : 'Available'}</div>
              </a>
            ))}
          </div>
        </section>
`.trim();

// Insert just before the final-cta section
const anchor = '<section className="final-cta">';
if (!s.includes('providers-section')) {
  if (s.includes(anchor)) {
    s = s.replace(anchor, PROVIDER_SECTION + '\n' + anchor);
    fs.writeFileSync(p, s, 'utf8');
    console.log('provider section inserted');
  } else {
    console.log('anchor not found');
  }
} else {
  console.log('provider section already present');
}
