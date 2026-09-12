export function parseCsv(text) {
    const records = [];
    let record = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const nextCharacter = text[index + 1];

        if (character === '"') {
            if (quoted && nextCharacter === '"') {
                field += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            record.push(field);
            field = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && nextCharacter === '\n') index += 1;
            record.push(field);
            if (record.some(value => value.trim() !== '')) records.push(record);
            record = [];
            field = '';
        } else {
            field += character;
        }
    }

    if (quoted) throw new Error('Unclosed quoted field');
    if (field || record.length) {
        record.push(field);
        if (record.some(value => value.trim() !== '')) records.push(record);
    }

    if (!records.length) return { fields: [], rows: [] };

    const fields = records[0].map(value => value.trim());
    const rows = records.slice(1).map((values, index) => {
        if (values.length !== fields.length) {
            throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${fields.length}`);
        }
        return Object.fromEntries(fields.map((name, fieldIndex) => [name, values[fieldIndex].trim()]));
    });

    return { fields, rows };
}