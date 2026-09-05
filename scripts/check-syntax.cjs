const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

for (const directory of ['content', 'shared', 'popup', 'background']) {
    for (const file of readdirSync(directory).filter(file => file.endsWith('.js')).sort()) {
        const filename = join(directory, file);
        // Compile, never execute. vm.Script enforces classic-script syntax even
        // when Node's .js module detection would otherwise accept import/export.
        new Script(readFileSync(filename, 'utf8'), { filename });
    }
}
