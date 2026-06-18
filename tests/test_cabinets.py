import unittest
from pathlib import Path

from app import CABINETS, DEFAULT_CABINET, normalize_cabinet


class CabinetTests(unittest.TestCase):
    def test_fixed_cabinets_are_normalized(self):
        self.assertEqual(DEFAULT_CABINET, "main")
        self.assertEqual(CABINETS["main"], "Main")
        self.assertEqual(CABINETS["new"], "New Cabinet")
        self.assertEqual(normalize_cabinet("new"), "new")
        self.assertEqual(normalize_cabinet("unknown"), "main")
        self.assertEqual(normalize_cabinet(None), "main")

    def test_models_store_cabinet_on_separated_data_only(self):
        source = Path("app.py").read_text(encoding="utf-8")

        self.assertIn("class Wallet(db.Model):", source)
        self.assertIn("cabinet = db.Column(db.String(50), default=DEFAULT_CABINET, nullable=False, index=True)", source)
        self.assertIn("class Transaction(db.Model):", source)
        self.assertIn("class Reserve(db.Model):", source)

        address_book_block = source.split("class AddressBook(db.Model):", 1)[1].split("class AmlCheck(db.Model):", 1)[0]
        self.assertNotIn("cabinet =", address_book_block)

    def test_wallet_and_transaction_apis_are_cabinet_scoped(self):
        source = Path("app.py").read_text(encoding="utf-8")

        self.assertIn("cabinet = selected_cabinet()", source)
        self.assertIn("query = Wallet.query.filter_by(cabinet=cabinet)", source)
        self.assertIn("Wallet.query.filter_by(cabinet=cabinet, is_hidden=False)", source)
        self.assertIn("Transaction.query.join(Wallet).filter(Transaction.cabinet == cabinet)", source)
        self.assertIn("wallets = Wallet.query.filter_by(cabinet=cabinet).all()", source)

    def test_frontends_send_selected_cabinet(self):
        mini_app = Path("telegram-miniapp/app.js").read_text(encoding="utf-8")
        web_wallets = Path("static/js/wallets.js").read_text(encoding="utf-8")
        template = Path("templates/wallets.html").read_text(encoding="utf-8")

        self.assertIn("activeCabinet", mini_app)
        self.assertIn("cabinetSelector", mini_app)
        self.assertIn("cabinetSelector", web_wallets)
        self.assertIn('id="cabinetSelector"', template)


if __name__ == "__main__":
    unittest.main()
