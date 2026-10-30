// Child process that owns the kuromoji dictionary for Japanese reading aids.
// Started on demand by lyricsReading.js and stopped when idle, so the ~350 MB
// the dictionary occupies is returned to the operating system between uses.

const path = require('path');
const kuromoji = require('kuromoji');

let tokenizer = null;

function loadTokenizer() {
    tokenizer ||= new Promise((resolve, reject) => {
        const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
        kuromoji.builder({ dicPath }).build((error, built) => (error ? reject(error) : resolve(built)));
    });
    return tokenizer;
}

process.on('message', async (message) => {
    const id = message?.id;
    try {
        const lines = Array.isArray(message?.lines) ? message.lines : [];
        const built = await loadTokenizer();
        const tokens = lines.map((line) => built.tokenize(String(line ?? '')).map((token) => ({
            surface: token.surface_form,
            reading: token.reading ?? null,
            pos: token.pos,
        })));
        process.send({ id, tokens });
    } catch (error) {
        process.send({ id, error: error.message || 'Tokenizer failed' });
    }
});

// The parent closing the channel means it is gone or done with us.
process.on('disconnect', () => process.exit(0));
