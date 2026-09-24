import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export interface EncryptedSecret {
  /** Opaque, storage-ready ciphertext (base64: iv + wrapped data key + tag + ciphertext). */
  encryptedPayload: string;
  /** Identifies which key-encryption key wrapped this secret's data key, for rotation. */
  keyId: string;
}

/**
 * Envelope encryption for OAuth tokens and other tenant credentials (PRD §10: "OAuth
 * tokens in a secrets vault with KMS envelope encryption"). Every secret gets its own
 * random data key (DEK); the DEK is wrapped by a key-encryption key (KEK) that this
 * interface never exposes to callers. Swap `LocalEnvelopeVault` for a `KmsVault` that
 * wraps/unwraps the DEK via AWS KMS / GCP KMS / Azure Key Vault without touching any
 * caller code — the interface is the contract, not the key management backend.
 */
export interface Vault {
  encrypt(plaintext: Record<string, unknown>): Promise<EncryptedSecret>;
  decrypt(secret: EncryptedSecret): Promise<Record<string, unknown>>;
}

const ALGO = "aes-256-gcm";

/**
 * Local development / single-region KEK implementation. The KEK is a 32-byte key from
 * VAULT_MASTER_KEY (base64). Never point this at a shared production master key without
 * also putting it behind an actual KMS — this class stores the KEK in process memory.
 */
export class LocalEnvelopeVault implements Vault {
  private readonly kek: Buffer;
  private readonly keyId: string;

  constructor(masterKeyBase64: string, keyId = "local-v1") {
    const kek = Buffer.from(masterKeyBase64, "base64");
    if (kek.length !== 32) {
      throw new Error("VAULT_MASTER_KEY must decode to exactly 32 bytes");
    }
    this.kek = kek;
    this.keyId = keyId;
  }

  async encrypt(plaintext: Record<string, unknown>): Promise<EncryptedSecret> {
    const dek = randomBytes(32);
    const plaintextBuf = Buffer.from(JSON.stringify(plaintext), "utf8");

    const dataIv = randomBytes(12);
    const dataCipher = createCipheriv(ALGO, dek, dataIv);
    const ciphertext = Buffer.concat([dataCipher.update(plaintextBuf), dataCipher.final()]);
    const dataAuthTag = dataCipher.getAuthTag();

    const kekIv = randomBytes(12);
    const kekCipher = createCipheriv(ALGO, this.kek, kekIv);
    const wrappedDek = Buffer.concat([kekCipher.update(dek), kekCipher.final()]);
    const kekAuthTag = kekCipher.getAuthTag();

    const blob = Buffer.concat([
      lengthPrefixed(kekIv),
      lengthPrefixed(kekAuthTag),
      lengthPrefixed(wrappedDek),
      lengthPrefixed(dataIv),
      lengthPrefixed(dataAuthTag),
      ciphertext,
    ]);

    return { encryptedPayload: blob.toString("base64"), keyId: this.keyId };
  }

  async decrypt(secret: EncryptedSecret): Promise<Record<string, unknown>> {
    if (secret.keyId !== this.keyId) {
      throw new Error(`No key-encryption key available for keyId "${secret.keyId}"`);
    }
    const blob = Buffer.from(secret.encryptedPayload, "base64");
    let offset = 0;
    const [kekIv, o1] = readLengthPrefixed(blob, offset);
    offset = o1;
    const [kekAuthTag, o2] = readLengthPrefixed(blob, offset);
    offset = o2;
    const [wrappedDek, o3] = readLengthPrefixed(blob, offset);
    offset = o3;
    const [dataIv, o4] = readLengthPrefixed(blob, offset);
    offset = o4;
    const [dataAuthTag, o5] = readLengthPrefixed(blob, offset);
    offset = o5;
    const ciphertext = blob.subarray(offset);

    const kekDecipher = createDecipheriv(ALGO, this.kek, kekIv);
    kekDecipher.setAuthTag(kekAuthTag);
    const dek = Buffer.concat([kekDecipher.update(wrappedDek), kekDecipher.final()]);

    const dataDecipher = createDecipheriv(ALGO, dek, dataIv);
    dataDecipher.setAuthTag(dataAuthTag);
    const plaintextBuf = Buffer.concat([dataDecipher.update(ciphertext), dataDecipher.final()]);

    return JSON.parse(plaintextBuf.toString("utf8"));
  }
}

function lengthPrefixed(buf: Buffer): Buffer {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

function readLengthPrefixed(buf: Buffer, offset: number): [Buffer, number] {
  const len = buf.readUInt16BE(offset);
  const start = offset + 2;
  const end = start + len;
  return [buf.subarray(start, end), end];
}
