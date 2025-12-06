import os
import json
from solders.keypair import Keypair
from solders.pubkey import Pubkey

KEY_FILE = "agent_identity.json"


class WalletManager:
    def __init__(self):
        self.keypair = self._load_or_create_wallet()

    def _load_or_create_wallet(self) -> Keypair:
        # 1. Check if the "locked" wallet file exists
        if os.path.exists(KEY_FILE):
            with open(KEY_FILE, "r") as f:
                data = json.load(f)
                # Reconstruct keypair from stored bytes
                return Keypair.from_bytes(bytes(data["secret"]))

        # 2. If not, force-create a new one (Zero Liberty)
        new_kp = Keypair()
        with open(KEY_FILE, "w") as f:
            json.dump(
                {
                    "secret": list(bytes(new_kp)),
                    "address": str(new_kp.pubkey())
                },
                f
            )

        print(f"[*] NEW AGENT CREATED. Address: {new_kp.pubkey()}")
        print("[*] ACTION REQUIRED: Send USDC (and small SOL) to this address to activate.")
        return new_kp

    def get_signer(self):
        return self.keypair

    def get_public_key(self) -> Pubkey:
        return self.keypair.pubkey()

