import unittest
from pathlib import Path

from app import APP_PASSWORD, app


class FeatureRemovalTests(unittest.TestCase):
    def test_dashboard_and_transit_routes_are_not_registered(self):
        rules = {rule.rule for rule in app.url_map.iter_rules()}

        self.assertNotIn("/transit-payments", rules)
        self.assertNotIn("/api/dashboard/weekly-stats", rules)
        self.assertNotIn("/api/dashboard/export-excel", rules)
        self.assertNotIn("/api/dashboard/transaction-types", rules)
        self.assertNotIn("/api/dashboard/daily-balances", rules)
        self.assertFalse(any(rule.startswith("/api/channels") for rule in rules))
        self.assertFalse(any(rule.startswith("/api/incoming-payments") for rule in rules))

    def test_login_and_root_redirect_to_wallets(self):
        app.config["TESTING"] = True
        with app.test_client() as client:
            response = client.post("/login", data={"password": APP_PASSWORD})
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.headers["Location"], "/wallets")

            response = client.get("/")
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.headers["Location"], "/wallets")

    def test_base_navigation_does_not_link_removed_features(self):
        base_template = Path("templates/base.html").read_text(encoding="utf-8")

        self.assertNotIn("dashboard", base_template)
        self.assertNotIn("transit_payments", base_template)
        self.assertNotIn("Transit Payments", base_template)

    def test_aml_check_escapes_user_controlled_values(self):
        aml_js = Path("static/js/aml_check.js").read_text(encoding="utf-8")

        self.assertIn("function escapeHtml", aml_js)
        self.assertIn("escapeHtml(check.customer || '-')", aml_js)
        self.assertIn("escapeHtml(check.manager || 'N4')", aml_js)

    def test_rendered_pages_do_not_reference_removed_assets(self):
        app.config["TESTING"] = True
        with app.test_client() as client:
            client.post("/login", data={"password": APP_PASSWORD})

            for path in ["/wallets", "/address-book", "/aml-check"]:
                response = client.get(path)
                body = response.get_data(as_text=True)
                self.assertEqual(response.status_code, 200)
                self.assertNotIn("dashboard.js", body)
                self.assertNotIn("transit_payments.js", body)
                self.assertNotIn("dashboard.html", body)
                self.assertNotIn("transit_payments.html", body)

    def test_session_api_mutations_require_csrf_header(self):
        app.config["TESTING"] = True
        with app.test_client() as client:
            client.post("/login", data={"password": APP_PASSWORD})

            response = client.post("/api/wallets/reorder", json={"order": []})
            self.assertEqual(response.status_code, 403)

            response = client.post(
                "/api/wallets/reorder",
                json={"order": []},
                headers={"X-Requested-With": "XMLHttpRequest"},
            )
            self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
