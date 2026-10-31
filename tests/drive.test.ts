import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { cleanName, parseFolderId } = await import("../src/lib/drive");

describe("google drive", () => {
  it("läser mapp-id ur länkar", () => {
    expect(parseFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing")).toBe("1AbCdEfGhIjKlMnOp");
    expect(parseFolderId("https://drive.google.com/drive/u/0/folders/0AAbbCCddEEffGG")).toBe("0AAbbCCddEEffGG");
    expect(parseFolderId("https://drive.google.com/open?id=1AbCdEfGhIjKl")).toBe("1AbCdEfGhIjKl");
    expect(parseFolderId("inte en länk")).toBeNull();
  });
  it("gör giltiga mappnamn", () => {
    expect(cleanName("2026-09-01 Konsert med Adam / AC\\DC")).toBe("2026-09-01 Konsert med Adam AC DC");
    expect(cleanName("   ")).toBe("Namnlös");
  });
});
