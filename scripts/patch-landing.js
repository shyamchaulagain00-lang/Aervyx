const fs = require('fs');
const p = 'c:\\Users\\TG\\OneDrive\\Documents\\Aervyx\\src\\Landing.tsx';
let s = fs.readFileSync(p, 'utf8');

const anchor = '}\n\nexport default function Landing() {';
const insert =
`}\n\nfunction DiscordLink() {
  return (
    <a
      className="discord-float"
      href="https://discord.gg/M7pD8FnSe"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join Aervyx Discord"
      title="Join our Discord"
    >
      <Discord size={22} aria-hidden="true" />
      <span className="discord-tooltip">Join our Discord</span>
    </a>
  );
}\n\n` +
'export default function Landing() {';

if (s.includes('function DiscordLink()')) {
  console.log('already patched');
} else if (s.includes(anchor)) {
  s = s.replace(anchor, insert);
  fs.writeFileSync(p, s, 'utf8');
  console.log('patched via anchor');
} else {
  s = s.replace('export default function Landing() {', insert);
  fs.writeFileSync(p, s, 'utf8');
  console.log('patched via fallback');
}
