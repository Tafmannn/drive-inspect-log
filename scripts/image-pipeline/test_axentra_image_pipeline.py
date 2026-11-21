"""Unit + offline end-to-end tests. Run: python3 -m unittest -v test_axentra_image_pipeline"""
import csv, io, json, os, tempfile, unittest, zipfile
from pathlib import Path
from unittest import mock

import axentra_image_pipeline as P

R = lambda make, model, body, y0, y1, iid="x_y_z_1": P.Row(iid, make, model, body, y0, y1)


class Matching(unittest.TestCase):
    def test_basic_match_with_year(self):
        s = P.match_score(R("Abarth", "124 Spider", "convertible", 2016, 2019), "2017 Abarth 124 Spider (front).jpg")
        self.assertIsNotNone(s); self.assertIn("year in range", s[1]); self.assertIn("body word match", s[1])

    def test_url_encoded_and_underscores(self):
        self.assertIsNotNone(P.match_score(R("Abarth", "124 Spider", "convertible", 2016, 2019), "Abarth_124_Spider_2016%20IMG_1.jpg"))

    def test_year_outside_range_rejected(self):
        self.assertIsNone(P.match_score(R("Alfa Romeo", "147", "hatchback", 2006, 2010), "2002 Alfa Romeo 147 GTA.jpg"))

    def test_year_off_by_one_allowed_low_score(self):
        s = P.match_score(R("Alfa Romeo", "147", "hatchback", 2006, 2010), "2005 Alfa Romeo 147.jpg")
        self.assertIn("year within 1 of range", s[1])

    def test_make_required(self):
        self.assertIsNone(P.match_score(R("Abarth", "500", "hatchback", 2008, 2023), "Fiat 500 2010 Paris.jpg"))

    def test_number_model_not_substring(self):
        row = R("Abarth", "500", "hatchback", 2008, 2023)
        self.assertIsNone(P.match_score(row, "Abarth 5000 concept.jpg"))
        self.assertIsNone(P.match_score(row, "Abarth 500X 2016.jpg"))

    def test_spaced_variant_suffix_rejected(self):
        self.assertIsNone(P.match_score(R("Fiat", "500", "hatchback", 2007, 2024), "Fiat 500 L 2014.jpg"))

    def test_short_model_needs_proximity(self):
        row = R("Aion", "V", "SUV", 2026, 2026)
        self.assertIsNotNone(P.match_score(row, "GAC Aion V 2026 Munich.jpg"))
        self.assertIsNone(P.match_score(row, "Aion stand at show, hall V, photo 3 by someone.jpg"))

    def test_make_alias(self):
        self.assertIsNotNone(P.match_score(R("Mercedes-Benz", "C-Class", "saloon", 2015, 2021), "Mercedes-Benz C-Class W205 2016.jpg"))
        self.assertIsNotNone(P.match_score(R("Volkswagen", "Golf", "hatchback", 2013, 2019), "VW Golf VII 2015.jpg"))

    def test_other_body_penalised(self):
        hatch = P.match_score(R("Audi", "A4", "saloon", 2016, 2024), "Audi A4 Avant 2018.jpg")
        sal = P.match_score(R("Audi", "A4", "saloon", 2016, 2024), "Audi A4 saloon 2018.jpg")
        self.assertLess(hatch[0], sal[0])

    def test_coupe_word_is_not_variant(self):
        self.assertIsNotNone(P.match_score(R("Audi", "A5", "coupe", 2017, 2024), "Audi A5 Coupe 2018.jpg"))


class Licences(unittest.TestCase):
    def rec(self, **k):
        base = {"license_code": "cc-by-4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
                "share_alike": "0", "allows_derivatives": "1"}
        base.update(k); return base

    def test_cc0_pd(self):
        self.assertEqual(P.classify_licence(self.rec(license_code="cc0", license_url=""))[0], "ACCEPT")
        self.assertEqual(P.classify_licence(self.rec(license_code="pd", license_url=""))[0], "ACCEPT")

    def test_cc_by(self):
        self.assertEqual(P.classify_licence(self.rec())[0], "ACCEPT")

    def test_by_sa_not_auto_rejected(self):
        self.assertEqual(P.classify_licence(self.rec(license_code="cc-by-sa-4.0", share_alike="1"))[0], "ACCEPT_SHAREALIKE")

    def test_non_commercial_rejected(self):
        self.assertEqual(P.classify_licence(self.rec(license_code="cc-by-nc-4.0"))[0], "REJECT")

    def test_no_derivatives_rejected(self):
        self.assertEqual(P.classify_licence(self.rec(license_code="cc-by-nd-4.0"))[0], "REJECT")
        self.assertEqual(P.classify_licence(self.rec(allows_derivatives="0"))[0], "REJECT")

    def test_missing_or_unknown(self):
        self.assertEqual(P.classify_licence(self.rec(license_code=""))[0], "UNVERIFIED")
        self.assertEqual(P.classify_licence(self.rec(license_url=""))[0], "UNVERIFIED")
        self.assertEqual(P.classify_licence(self.rec(license_code="gfdl"))[0], "UNVERIFIED")

    def test_provenance_rules(self):
        pr = {"licence_decision": "ACCEPT", "license_code": "cc-by-4.0", "license_url": "u", "attribution_text": "",
              "creator": "", "source_page_url": "p"}
        self.assertIn("attribution required but no credit text", P.provenance_issues(pr))
        pr.update(licence_decision="ACCEPT_SHAREALIKE", license_code="cc-by-sa-4.0", attribution_text="Photo: A")
        with mock.patch.object(P, "SHARE_ALIKE_POLICY", "REVIEW"):
            self.assertTrue(any("BY-SA" in i for i in P.provenance_issues(pr)))
        with mock.patch.object(P, "SHARE_ALIKE_POLICY", "ACCEPT"):
            self.assertEqual(P.provenance_issues(pr), [])


class Filenames(unittest.TestCase):
    ids = {"abarth_124-spider_convertible_1", "alfa-romeo_147_hatchback_1"}

    def test_valid(self):
        self.assertTrue(P.valid_output_name("abarth_124-spider_convertible_1.png", self.ids)[0])

    def test_invalid(self):
        for n in ["abarth_124-spider_convertible_1.jpg", "Abarth_124-spider_convertible_1.png",
                  "abarth_124 spider_convertible_1.png", "abarth_124-spider_convertible_2.png", "abarth.png"]:
            self.assertFalse(P.valid_output_name(n, self.ids)[0], n)


class FitCanvas(unittest.TestCase):
    def test_no_stretch(self):
        from PIL import Image
        out, s = P.fit_on_canvas(Image.new("RGB", (4000, 1000), "grey"))
        self.assertEqual(out.size, P.CANVAS)
        # grey box keeps 4:1 aspect
        bbox = out.convert("L").point(lambda v: 255 if v < 250 else 0).getbbox()
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        self.assertAlmostEqual(w / h, 4.0, delta=0.05)


class EndToEndOffline(unittest.TestCase):
    """Full pipeline on a fixture index with network calls mocked."""

    def test_pipeline(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            man = td / "m.csv"
            with man.open("w", newline="") as f:
                w = csv.writer(f); w.writerow(["illustration_id", "phase", "make", "model", "body_type", "year_from", "year_to"])
                w.writerow(["abarth_124-spider_convertible_1", 1, "Abarth", "124 Spider", "convertible", 2016, 2019])
                w.writerow(["alfa-romeo_147_hatchback_1", 1, "Alfa Romeo", "147", "hatchback", 2006, 2010])
                w.writerow(["aion_ut_hatchback_1", 1, "Aion", "UT", "hatchback", 2026, 2026])
            idx = td / "idx.csv"
            cols = ["photo_id", "sha256", "source_page_url", "source_url", "source_filename", "license_code", "license_name",
                    "license_url", "share_alike", "allows_derivatives", "creator_name", "credit_text", "width", "height"]
            recs = [
                ["1", "", "https://commons/p1", "https://upload/a1.jpg", "2017 Abarth 124 Spider.jpg", "cc-by-4.0", "", "https://cc/by", "0", "1", "Ann", "Photo: Ann, CC BY 4.0", "3000", "2000"],
                ["1", "", "https://commons/p1", "https://upload/a1.jpg", "2017 Abarth 124 Spider.jpg", "cc-by-4.0", "", "https://cc/by", "0", "1", "Ann", "Photo: Ann, CC BY 4.0", "3000", "2000"],  # duplicate
                ["2", "", "https://commons/p2", "https://upload/a2.jpg", "Abarth 124 Spider 2018 rear.jpg", "cc-by-nc-2.0", "", "https://cc/nc", "0", "1", "Bob", "Bob", "3000", "2000"],
                ["3", "", "https://commons/p3", "https://upload/a3.jpg", "Alfa Romeo 147 2008.jpg", "cc0", "", "", "0", "1", "", "", "2400", "1600"],
                ["4", "", "https://commons/p4", "https://upload/a4.jpg", "2001 Alfa Romeo 147.jpg", "cc0", "", "", "0", "1", "", "", "2400", "1600"],
            ]
            with idx.open("w", newline="") as f:
                w = csv.writer(f); w.writerow(cols); w.writerows(recs)
            work = td / "out"
            run = lambda *a: P.main([a[0], "--manifest", str(man), "--work", str(work), *a[1:]])

            run("match", "--index-file", str(idx))
            summ = {r["illustration_id"]: r for r in P.read_csv(work / "summary.csv")}
            self.assertEqual(summ["abarth_124-spider_convertible_1"]["metadata_matches"], "2")  # dup removed
            self.assertEqual(summ["abarth_124-spider_convertible_1"]["licence_ok"], "1")      # NC rejected
            self.assertEqual(summ["alfa-romeo_147_hatchback_1"]["metadata_matches"], "1")     # 2001 rejected
            self.assertEqual(summ["aion_ut_hatchback_1"]["status"], P.NO_METADATA_MATCH)

            def fake_get(url, **k):
                shade = 60 + (sum(url.encode()) % 120)
                b = io.BytesIO(); Image.new("RGB", (1800, 1200), (shade, shade, shade + 10)).save(b, "JPEG"); return b.getvalue()
            with mock.patch.object(P, "http_get", side_effect=fake_get):
                run("download", "--delay", "0")
                run("download", "--delay", "0")  # resume: must not fail or duplicate
            run("sheet")
            self.assertTrue((work / "contact_sheets" / "abarth_124-spider_convertible_1.jpg").exists())

            # Nothing accepted yet -> nothing processed or packaged
            run("process"); run("validate"); run("package")
            self.assertEqual(list((work / "batches").glob("*.zip")), [])

            # Human accepts both downloaded photos
            rv = P.read_csv(work / "review.csv")
            for r in rv:
                r.update(decision="ACCEPT", checked_make_model="Y", checked_generation="Y", checked_body_type="Y")
            P.write_csv(work / "review.csv", rv)
            run("process"); issues = P.stage_validate(type("A", (), {"work": str(work), "manifest": str(man)}))
            self.assertEqual(issues, [])
            prov = {r["illustration_id"]: r for r in P.read_csv(work / "provenance.csv")}
            self.assertTrue(all(r["status"] == P.DONE_VERIFIED for r in prov.values()))
            self.assertIn("photograph", prov["alfa-romeo_147_hatchback_1"]["image_type"])
            run("package")
            zips = list((work / "batches").glob("*.zip"))
            self.assertEqual(len(zips), 1); self.assertIn("PARTIAL_2of10", zips[0].name)
            with zipfile.ZipFile(zips[0]) as z:
                names = set(z.namelist())
                self.assertEqual(names, {"abarth_124-spider_convertible_1.png", "alfa-romeo_147_hatchback_1.png", "ATTRIBUTION.txt", "report.json"})
                self.assertFalse(json.loads(z.read("report.json"))["complete"])
            run("report")
            rep = json.loads((work / "feasibility_report.json").read_text())
            self.assertEqual(rep["vehicles_searched"], 3); self.assertEqual(rep["processed_and_verified"], 2)
            self.assertEqual(rep["no_usable_source"], ["aion_ut_hatchback_1"])

            # A tampered output (wrong size) must fail validation and drop out of DONE_VERIFIED
            Image.new("RGB", (800, 600), "grey").save(work / "processed" / "alfa-romeo_147_hatchback_1.png")
            issues = P.stage_validate(type("A", (), {"work": str(work), "manifest": str(man)}))
            self.assertTrue(any("size" in i["issue"] for i in issues))
            prov = {r["illustration_id"]: r for r in P.read_csv(work / "provenance.csv")}
            self.assertEqual(prov["alfa-romeo_147_hatchback_1"]["status"], P.VALIDATION_FAILED)


if __name__ == "__main__":
    unittest.main()
