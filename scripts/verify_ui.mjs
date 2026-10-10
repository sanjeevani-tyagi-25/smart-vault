import http from 'http';

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function verify() {
  const dash = await get('http://localhost:3000/dashboard');
  console.log('Dashboard status:', dash.status);

  const cssMatch = dash.data.match(/href="(\/_next\/static\/css\/[^"]+)"/);
  if (!cssMatch) {
    console.error('No CSS link found');
    return;
  }

  const cssUrl = 'http://localhost:3000' + cssMatch[1];
  console.log('CSS URL:', cssUrl);
  const css = await get(cssUrl);
  console.log('CSS size:', css.data.length);

  const checks = [
    { label: 'Input color #0f172a', test: css.data.includes('#0f172a') },
    { label: 'Placeholder color #94a3b8', test: css.data.includes('#94a3b8') },
    { label: 'Color-scheme light', test: css.data.includes('color-scheme:light') || css.data.includes('color-scheme: light') },
    { label: 'bg-white utility', test: css.data.includes('bg-white') },
    { label: 'text-slate-900 utility', test: css.data.includes('text-slate-900') },
    { label: 'placeholder:text-slate-400 utility', test: css.data.includes('text-slate-400') },
    { label: 'Teal focus styling (#08c5b3)', test: css.data.includes('#08c5b3') || css.data.includes('focus:ring-teal-500') || css.data.includes('ring-teal-500') }
  ];

  for (const c of checks) {
    console.log(`[${c.test ? 'PASS' : 'FAIL'}] ${c.label}`);
  }
}

verify().catch(console.error);
