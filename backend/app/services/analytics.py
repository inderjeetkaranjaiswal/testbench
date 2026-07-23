import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict


def parse_surefire_reports(project_path: str) -> Dict[str, int]:
    """
    Recursively scans workspace/{project_name}/ for TestNG and Surefire XML report files,
    parses XML testsuite metrics, and extracts passed, failed, and skipped test counts.
    Safely returns zeros if reports do not exist or tests haven't finished.
    """
    totals = {"passed": 0, "failed": 0, "skipped": 0, "total": 0}

    path = Path(project_path)
    if not path.exists() or not path.is_dir():
        return totals

    # 1. Search for TestNG results XML recursively across any nested project depth
    testng_files = list(path.rglob("testng-results.xml"))
    if testng_files:
        best_passed = 0
        best_failed = 0
        best_skipped = 0
        best_total = 0
        for testng_file in testng_files:
            try:
                tree = ET.parse(testng_file)
                root = tree.getroot()
                if root.tag == "testng-results":
                    passed = int(root.attrib.get("passed", 0))
                    failed = int(root.attrib.get("failed", 0))
                    skipped = int(root.attrib.get("skipped", 0))
                    total = int(root.attrib.get("total", 0))

                    if total == 0:
                        # Fallback: Count test-method tags if root attributes are 0
                        for method in root.iter("test-method"):
                            is_config = method.attrib.get("is-config", "false")
                            if is_config.lower() == "true":
                                continue
                            st = method.attrib.get("status", "").upper()
                            total += 1
                            if st in ("PASS", "PASSED"):
                                passed += 1
                            elif st in ("FAIL", "FAILED"):
                                failed += 1
                            elif st in ("SKIP", "SKIPPED"):
                                skipped += 1

                    if total > best_total or (total > 0 and (passed + failed + skipped) > (best_passed + best_failed + best_skipped)):
                        best_passed = passed
                        best_failed = failed
                        best_skipped = skipped
                        best_total = max(total, passed + failed + skipped)
            except Exception as e:
                print(f"[Analytics Warning] Failed to parse testng-results {testng_file.name}: {e}")

        if best_total > 0:
            return {
                "passed": best_passed,
                "failed": best_failed,
                "skipped": best_skipped,
                "total": best_total,
            }

    # 2. Search for Surefire JUnit XML files recursively
    xml_files = list(path.rglob("TEST-*.xml"))
    if xml_files:
        total_tests = 0
        total_failures = 0
        total_errors = 0
        total_skipped = 0

        for xml_file in xml_files:
            try:
                tree = ET.parse(xml_file)
                root = tree.getroot()
                if root.tag == "testsuite":
                    total_tests += int(root.attrib.get("tests", 0))
                    total_failures += int(root.attrib.get("failures", 0))
                    total_errors += int(root.attrib.get("errors", 0))
                    total_skipped += int(root.attrib.get("skipped", 0))
                elif root.tag == "testsuites":
                    for suite in root.findall("testsuite"):
                        total_tests += int(suite.attrib.get("tests", 0))
                        total_failures += int(suite.attrib.get("failures", 0))
                        total_errors += int(suite.attrib.get("errors", 0))
                        total_skipped += int(suite.attrib.get("skipped", 0))
            except Exception as e:
                print(f"[Analytics Warning] Failed to parse {xml_file.name}: {e}")

        if total_tests > 0:
            failed_count = total_failures + total_errors
            passed_count = max(0, total_tests - (failed_count + total_skipped))
            return {
                "passed": passed_count,
                "failed": failed_count,
                "skipped": total_skipped,
                "total": total_tests,
            }

    return totals

