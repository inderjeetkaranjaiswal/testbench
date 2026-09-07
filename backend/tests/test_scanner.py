import unittest
import tempfile
import os
import io
import zipfile
from pathlib import Path

from app.services.scanner import (
    inspect_project,
    find_project_root,
    _parse_java_test_file,
    _parse_python_test_file,
    _parse_playwright_test_file
)
from app.main import safe_extract_zip


class TestGenericScanner(unittest.TestCase):

    def test_java_maven_appium_testng_discovery(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            proj_dir = Path(tmpdir) / "appium_project"
            proj_dir.mkdir()

            # pom.xml with Appium & TestNG
            pom = proj_dir / "pom.xml"
            pom.write_text("""
            <project>
                <dependencies>
                    <dependency>
                        <groupId>io.appium</groupId>
                        <artifactId>java-client</artifactId>
                        <version>8.5.1</version>
                    </dependency>
                    <dependency>
                        <groupId>org.testng</groupId>
                        <artifactId>testng</artifactId>
                        <version>7.8.0</version>
                    </dependency>
                </dependencies>
            </project>
            """, encoding="utf-8")

            # Java Test file
            test_dir = proj_dir / "src" / "test" / "java" / "tests"
            test_dir.mkdir(parents=True)
            test_file = test_dir / "LoginValidationTest.java"
            test_file.write_text("""
            package tests;
            import org.testng.annotations.Test;
            import io.appium.java_client.android.AndroidDriver;

            public class LoginValidationTest {
                @Test(groups = {"smoke"})
                public void testEmptyMobileNumber() {
                    // test body
                }

                @Test
                public void testInvalidMobileNumber() {
                    // test body
                }
            }
            """, encoding="utf-8")

            metadata = inspect_project(str(proj_dir))
            self.assertEqual(metadata["language"], "java")
            self.assertEqual(metadata["framework"], "appium")
            self.assertEqual(metadata["build_system"], "maven")
            self.assertEqual(metadata["test_framework"], "testng")
            self.assertEqual(metadata["platform"], "android")
            self.assertEqual(metadata["test_count"], 2)

            targets = [t["execution_target"] for t in metadata["tests"]]
            self.assertIn("LoginValidationTest#testEmptyMobileNumber", targets)
            self.assertIn("LoginValidationTest#testInvalidMobileNumber", targets)

    def test_java_maven_selenium_discovery(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            proj_dir = Path(tmpdir) / "selenium_project"
            proj_dir.mkdir()

            pom = proj_dir / "pom.xml"
            pom.write_text("""
            <project>
                <dependencies>
                    <dependency>
                        <groupId>org.seleniumhq.selenium</groupId>
                        <artifactId>selenium-java</artifactId>
                        <version>4.15.0</version>
                    </dependency>
                    <dependency>
                        <groupId>org.testng</groupId>
                        <artifactId>testng</artifactId>
                        <version>7.8.0</version>
                    </dependency>
                </dependencies>
            </project>
            """, encoding="utf-8")

            test_dir = proj_dir / "tests"
            test_dir.mkdir()
            test_file = test_dir / "WebCheckoutTest.java"
            test_file.write_text("""
            package tests;
            import org.testng.annotations.Test;
            import org.openqa.selenium.WebDriver;

            public class WebCheckoutTest {
                @Test
                public void testCompleteCheckout() {}
            }
            """, encoding="utf-8")

            metadata = inspect_project(str(proj_dir))
            self.assertEqual(metadata["language"], "java")
            self.assertEqual(metadata["framework"], "selenium")
            self.assertEqual(metadata["build_system"], "maven")
            self.assertEqual(metadata["platform"], "web")
            self.assertEqual(metadata["test_count"], 1)
            self.assertEqual(metadata["tests"][0]["execution_target"], "WebCheckoutTest#testCompleteCheckout")

    def test_python_pytest_discovery(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            proj_dir = Path(tmpdir) / "python_pytest_proj"
            proj_dir.mkdir()

            reqs = proj_dir / "requirements.txt"
            reqs.write_text("pytest>=7.0.0\nselenium>=4.0.0\n", encoding="utf-8")

            pytest_ini = proj_dir / "pytest.ini"
            pytest_ini.write_text("[pytest]\ntestpaths = tests\n", encoding="utf-8")

            test_dir = proj_dir / "tests"
            test_dir.mkdir()
            test_file = test_dir / "test_auth.py"
            test_file.write_text("""
            import pytest

            def test_valid_login():
                pass

            def test_empty_password():
                pass

            class TestProfile:
                def test_update_name(self):
                    pass
            """, encoding="utf-8")

            metadata = inspect_project(str(proj_dir))
            self.assertEqual(metadata["language"], "python")
            self.assertEqual(metadata["test_framework"], "pytest")
            self.assertEqual(metadata["test_count"], 3)

            targets = [t["execution_target"] for t in metadata["tests"]]
            self.assertTrue(any("test_valid_login" in t for t in targets))
            self.assertTrue(any("test_empty_password" in t for t in targets))
            self.assertTrue(any("TestProfile" in t and "test_update_name" in t for t in targets))

    def test_typescript_playwright_discovery(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            proj_dir = Path(tmpdir) / "playwright_ts_proj"
            proj_dir.mkdir()

            pkg = proj_dir / "package.json"
            pkg.write_text('{"name":"pw-tests","devDependencies":{"@playwright/test":"^1.40.0"}}', encoding="utf-8")

            config = proj_dir / "playwright.config.ts"
            config.write_text('import { defineConfig } from "@playwright/test"; export default defineConfig({});', encoding="utf-8")

            test_dir = proj_dir / "tests"
            test_dir.mkdir()
            spec_file = test_dir / "dashboard.spec.ts"
            spec_file.write_text("""
            import { test, expect } from '@playwright/test';

            test('has title', async ({ page }) => {
                await expect(page).toHaveTitle(/Dashboard/);
            });

            test('can navigate to settings', async ({ page }) => {
                // nav
            });
            """, encoding="utf-8")

            metadata = inspect_project(str(proj_dir))
            self.assertEqual(metadata["language"], "typescript")
            self.assertEqual(metadata["framework"], "playwright")
            self.assertEqual(metadata["test_framework"], "playwright")
            self.assertEqual(metadata["platform"], "web")
            self.assertEqual(metadata["test_count"], 2)

            test_names = [t["name"] for t in metadata["tests"]]
            self.assertIn("has title", test_names)
            self.assertIn("can navigate to settings", test_names)

    def test_false_positive_resistance(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            proj_dir = Path(tmpdir) / "hybrid_doc_proj"
            proj_dir.mkdir()

            # README mentioning Selenium, but code is Appium Java
            readme = proj_dir / "README.md"
            readme.write_text("# This used to be a Selenium suite, but was migrated to Appium\nselenium is awesome", encoding="utf-8")

            pom = proj_dir / "pom.xml"
            pom.write_text("""
            <project>
                <dependencies>
                    <dependency>
                        <groupId>io.appium</groupId>
                        <artifactId>java-client</artifactId>
                        <version>8.5.1</version>
                    </dependency>
                </dependencies>
            </project>
            """, encoding="utf-8")

            metadata = inspect_project(str(proj_dir))
            self.assertEqual(metadata["framework"], "appium")

    def test_path_traversal_protection(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            target_dir = Path(tmpdir) / "extract_dest"
            target_dir.mkdir()

            # Create a zip containing a malicious path traversal entry
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as z:
                z.writestr("../../evil.txt", "malicious payload")
            zip_buffer.seek(0)

            bad_zip_file = Path(tmpdir) / "malicious.zip"
            bad_zip_file.write_bytes(zip_buffer.getvalue())

            with self.assertRaises(ValueError):
                safe_extract_zip(bad_zip_file, target_dir)


if __name__ == "__main__":
    unittest.main()
