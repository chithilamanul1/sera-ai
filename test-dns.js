const dns = require('node:dns');

console.log('Default order before:', dns.getDefaultResultOrder ? dns.getDefaultResultOrder() : 'unknown');

// Apply fix
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
console.log('Default order after:', dns.getDefaultResultOrder ? dns.getDefaultResultOrder() : 'unknown');

const hostname = 'generativelanguage.googleapis.com';

dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) {
        console.error('DNS Lookup Error:', err);
        return;
    }
    console.log(`DNS Lookup for ${hostname}:`, addresses);
});
