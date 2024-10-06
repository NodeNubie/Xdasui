// quick math following bcs.u64().serialize(N).toBytes() and back

const bigIntTo32Bytes = (v) => {
    let hex = BigInt(v).toString(16);
    if (hex.length % 2) { hex = '0' + hex; }

    while (hex.length < 64) { // 32 bytes, 64 hex chars
        hex = '0' + hex;
    }

    const len = hex.length / 2;
    const u8 = new Uint8Array(len);
      
    let i = 0;
    let j = 0;
    while (i < len) {
        u8[i] = parseInt(hex.slice(j, j+2), 16);
        i += 1;
        j += 2;
    }

    return u8;
};

const u64toBytes = (v) => {
    let hex = BigInt(v).toString(16);
    if (hex.length % 2) { hex = '0' + hex; }

    while (hex.length < 16) { // u64 is 8 bytes, 16 hex chars
        hex = '0' + hex;
    }

    const len = hex.length / 2;
    const u8 = new Uint8Array(len);
      
    let i = 0;
    let j = 0;
    while (i < len) {
        u8[i] = parseInt(hex.slice(j, j+2), 16);
        i += 1;
        j += 2;
    }

    u8.reverse();

    return u8;
};

const incrementBytes = (bytes) => {
    let i = 0;
    while (bytes[i] == 255) { bytes[i] = 0; i = i + 1; };
    bytes[i] = bytes[i] + 1;
};

const bytesTou64 = (bytes) => {
    return BigInt('0x'+Array.from(bytes).reverse().map(e => e.toString(16).padStart(2, 0)).join(''));
};

export  {
    incrementBytes,
    bytesTou64,
    u64toBytes,
    bigIntTo32Bytes,
};
