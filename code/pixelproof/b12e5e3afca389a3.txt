"""Core guarantees of the factory. Run: python -m unittest discover -s tests  (or pytest)."""
import random
import unittest

import numpy as np

import pixelproof  # noqa: F401
from pixelproof.core import LEVELS, REGISTRY, Answer
from pixelproof.pipeline import build_pair
from pixelproof.scoring import classify_error, parse

PAIRS_PER_LEVEL = 3


class TestFamilies(unittest.TestCase):
    def test_every_family_level_produces_verified_counterfactual_pairs(self):
        from collections import Counter
        for name, fam in REGISTRY.items():
            for level in range(LEVELS):
                for i in range(PAIRS_PER_LEVEL):
                    with self.subTest(family=name, level=level, i=i):
                        res = build_pair(fam, random.Random(1000 * level + i), level, None, Counter(), [])
                        self.assertIsNotNone(res, "gauntlet should find a valid pair")
                        pa, ia, pb, ib, _ = res
                        a, b = fam.answer(pa), fam.answer(pb)
                        # same question, different answer (blind-safety)
                        self.assertEqual(fam.question(pa), fam.question(pb))
                        self.assertFalse(a.matches(b.value))
                        # the independent verifier recovers both answers from pixels
                        self.assertTrue(a.matches(fam.verify(np.asarray(ia), fam.public(pa), pa["q"])))
                        self.assertTrue(b.matches(fam.verify(np.asarray(ib), fam.public(pb), pb["q"])))
                        # and discriminates: twin A's pixels do NOT support twin B's answer
                        self.assertFalse(b.matches(fam.verify(np.asarray(ia), fam.public(pa), pa["q"])))

    def test_generation_is_deterministic(self):
        from collections import Counter
        for name, fam in REGISTRY.items():
            with self.subTest(family=name):
                r1 = build_pair(fam, random.Random(42), 2, None, Counter(), [])
                r2 = build_pair(fam, random.Random(42), 2, None, Counter(), [])
                self.assertEqual(np.asarray(r1[1]).tobytes(), np.asarray(r2[1]).tobytes())


class TestScoring(unittest.TestCase):
    def test_numeric_tolerance(self):
        a = Answer("float", 42.5, tol=0.5)
        self.assertTrue(a.matches(42.9))
        self.assertFalse(a.matches(43.1))

    def test_parse_strict_answer_line(self):
        a = Answer("int", 7)
        v, strict = parse("I count 6 then 7 objects.\nANSWER: 7", a)
        self.assertEqual((v, strict), (7.0, True))
        self.assertEqual(classify_error(v, a), "correct")
        self.assertEqual(classify_error(8, a), "off_by_one")

    def test_parse_label(self):
        a = Answer("label", "blue square")
        v, _ = parse("ANSWER: The Blue Square.", a)
        self.assertTrue(a.matches(v))
        v, _ = parse("ANSWER: blue", a)
        self.assertFalse(a.matches(v))

    def test_unparsed_is_wrong(self):
        a = Answer("int", 3)
        v, strict = parse("I think it is 3", a)
        self.assertEqual(classify_error(v, a), "unparsed")


if __name__ == "__main__":
    unittest.main()
