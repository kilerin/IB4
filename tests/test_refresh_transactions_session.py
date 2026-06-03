import unittest
from unittest.mock import patch

from app import (
    commit_refresh_batch,
    db,
    is_approve_contract_call,
    should_import_trc20_transaction,
)


class RefreshTransactionSessionTests(unittest.TestCase):
    def test_commit_refresh_batch_rolls_back_failed_commit(self):
        errors = []

        with patch.object(db.session, "commit", side_effect=RuntimeError("database is locked")), \
             patch.object(db.session, "rollback") as rollback:
            ok = commit_refresh_batch("test wallet", errors)

        self.assertFalse(ok)
        rollback.assert_called_once()
        self.assertEqual(errors, ["Error saving transactions for test wallet: database is locked"])

    def test_should_not_import_trc20_approval_as_transfer(self):
        self.assertFalse(should_import_trc20_transaction({"type": "Approval"}))
        self.assertTrue(should_import_trc20_transaction({"type": "Transfer"}))
        self.assertTrue(should_import_trc20_transaction({}))

    def test_detects_approve_contract_call(self):
        self.assertTrue(is_approve_contract_call({"data": "095ea7b3" + "0" * 128}))
        self.assertFalse(is_approve_contract_call({"data": "a9059cbb" + "0" * 128}))
        self.assertFalse(is_approve_contract_call({}))


if __name__ == "__main__":
    unittest.main()
