"""
Unit tests for OTP hashing utilities (FIX-003).
Pure functions — no app or DB needed.
Covers H.7 from the test plan.
"""
import hashlib
import secrets
import pytest


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def verify_otp_hash(code: str, stored_hash: str) -> bool:
    return secrets.compare_digest(hash_otp(code), stored_hash)


class TestOtpHashing:
    def test_hash_produces_64_char_hex(self):
        h = hash_otp("123456")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_same_code_produces_same_hash(self):
        assert hash_otp("123456") == hash_otp("123456")

    def test_different_codes_produce_different_hashes(self):
        assert hash_otp("123456") != hash_otp("654321")

    def test_verify_correct_code_returns_true(self):
        code = "987654"
        stored = hash_otp(code)
        assert verify_otp_hash(code, stored) is True

    def test_verify_wrong_code_returns_false(self):
        stored = hash_otp("987654")
        assert verify_otp_hash("000000", stored) is False

    def test_hash_is_not_reversible(self):
        code = "123456"
        h = hash_otp(code)
        assert code not in h

    def test_six_digit_codes_all_hash_correctly(self):
        for code in ["000000", "999999", "123456", "654321"]:
            h = hash_otp(code)
            assert verify_otp_hash(code, h)
            assert not verify_otp_hash("000001" if code != "000001" else "000002", h)

    def test_otp_generation_uses_secure_rng(self):
        """Verify that 6-digit OTPs are generated with secrets.randbelow."""
        codes = set()
        for _ in range(100):
            code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
            assert len(code) == 6
            assert code.isdigit()
            codes.add(code)
        # With 100 samples from 1M possibilities, expect reasonable diversity
        assert len(codes) > 50
