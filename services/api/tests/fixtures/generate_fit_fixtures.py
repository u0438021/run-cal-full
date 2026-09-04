"""Generate tiny, deterministic FIT fixtures with synthetic data and valid CRCs."""

import struct
from pathlib import Path

FIT_EPOCH_TIMESTAMP = 1_073_001_600  # 2024-01-01T00:00:00Z in FIT epoch seconds
OUTPUT = Path(__file__).parent


def crc16(data: bytes, crc: int = 0) -> int:
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def definition(local: int, global_number: int, fields: list[tuple[int, int, int]], developer=()):
    header = bytes([0x40 | (0x20 if developer else 0) | local])
    body = struct.pack("<BBHB", 0, 0, global_number, len(fields))
    body += b"".join(struct.pack("BBB", *field) for field in fields)
    if developer:
        body += bytes([len(developer)])
        body += b"".join(struct.pack("BBB", *field) for field in developer)
    return header + body


def data_message(local: int, payload: bytes) -> bytes:
    return bytes([local]) + payload


def fixed_string(value: str, size: int) -> bytes:
    raw = value.encode("ascii")[: size - 1] + b"\0"
    return raw.ljust(size, b"\0")


def fit_file(data: bytes) -> bytes:
    header_without_crc = struct.pack("<BBHI4s", 14, 0x20, 2200, len(data), b".FIT")
    header = header_without_crc + struct.pack("<H", crc16(header_without_crc))
    return header + data + struct.pack("<H", crc16(header + data))


def session_message() -> bytes:
    fields = [
        (253, 4, 0x86), (2, 4, 0x86), (5, 1, 0x00), (6, 1, 0x00),
        (7, 4, 0x86), (8, 4, 0x86), (9, 4, 0x86), (14, 2, 0x84),
        (15, 2, 0x84), (16, 1, 0x02), (17, 1, 0x02), (20, 2, 0x84),
        (21, 2, 0x84),
    ]
    payload = struct.pack(
        "<IIBBII I HHBBHH".replace(" ", ""),
        FIT_EPOCH_TIMESTAMP + 600, FIT_EPOCH_TIMESTAMP, 1, 0,
        600_000, 590_000, 150_000, 3000, 3600, 145, 168, 250, 420,
    )
    return definition(0, 18, fields) + data_message(0, payload)


def record_messages(with_stryd: bool) -> bytes:
    native = [
        (253, 4, 0x86), (2, 2, 0x84), (3, 1, 0x02), (4, 1, 0x02),
        (5, 4, 0x86), (6, 2, 0x84), (7, 2, 0x84),
    ]
    developer = [(0, 2, 0), (1, 2, 0), (2, 2, 0), (3, 2, 0)] if with_stryd else ()
    result = definition(1, 20, native, developer)
    for index in range(3):
        payload = struct.pack(
            "<IHBBIHH",
            FIT_EPOCH_TIMESTAMP + index * 5,
            2750 + index * 5,
            140 + index,
            86 + index,
            index * 500,
            3000 + index * 10,
            240 + index * 5,
        )
        if with_stryd:
            payload += struct.pack("<HHHH", 250 + index * 5, 55 + index, 4 + index, 95 + index)
        result += data_message(1, payload)
    return result


def developer_metadata() -> bytes:
    developer_id_fields = [(3, 1, 0x02), (1, 16, 0x0D)]
    result = definition(2, 207, developer_id_fields)
    result += data_message(2, bytes([0]) + bytes.fromhex("00112233445566778899aabbccddeeff"))

    description_fields = [
        (0, 1, 0x02), (1, 1, 0x02), (2, 1, 0x02), (3, 24, 0x07),
        (6, 1, 0x02), (7, 1, 0x01), (8, 12, 0x07), (14, 2, 0x84), (15, 1, 0x02),
    ]
    result += definition(3, 206, description_fields)
    descriptions = [
        (0, "Power", "watts"),
        (1, "Form Power", "watts"),
        (2, "Air Power", "watts"),
        (3, "Leg Spring Stiffness", "kN/m"),
    ]
    for number, name, units in descriptions:
        payload = struct.pack("BBB", 0, number, 0x84)
        payload += fixed_string(name, 24)
        payload += struct.pack("Bb", 1, 0)
        payload += fixed_string(units, 12)
        payload += struct.pack("<HB", 20, 7)
        result += data_message(3, payload)
    return result


def generate() -> None:
    garmin = record_messages(False) + session_message()
    stryd = developer_metadata() + record_messages(True) + session_message()
    (OUTPUT / "synthetic_garmin_running.fit").write_bytes(fit_file(garmin))
    (OUTPUT / "synthetic_stryd_running.fit").write_bytes(fit_file(stryd))


if __name__ == "__main__":
    generate()
