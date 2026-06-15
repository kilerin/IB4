import unittest
from pathlib import Path


class WalletColorUiTests(unittest.TestCase):
    def test_wallet_details_modal_exposes_color_selector(self):
        template = Path("templates/wallets.html").read_text(encoding="utf-8")

        self.assertIn("walletDetailsColor", template)
        self.assertIn('value="red"', template)
        self.assertIn('value="gray"', template)


if __name__ == "__main__":
    unittest.main()
