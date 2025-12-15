# x402-solana

x402-solana is an Autonomous Payment Agent SDK designed for seamless integration of the x402 protocol with Solana blockchain applications. It automates handling HTTP 402 "Payment Required" responses by initiating Solana payments (SOL or USDC), enabling access to paywalled content.

---

## Features

- **Automatic Payment Handling**: Handles HTTP 402 responses with Solana-based payments.
- **Dual Currency Support**: Supports both SOL native token payments and SPL token (like USDC) payments.
- **Seamless Integration**: Easily integrates with Solana wallets and RPC networking.
- **Dev-Friendly Utility Functions**:
  - Transaction Building: Easily construct and sign SOL and token transactions.
  - Verification Mechanisms: Verify payment headers and processed transactions.
- **Extendable SDK**: Customizable for a variety of Solana-based app requirements.

---

## Getting Started

### Prerequisites

Ensure the following are set up in your environment:

- **Python 3.9 or Later**
- **Solana Wallet**: With an adequate balance of SOL and/or USDC.
- **Internet Connection**: For RPC calls to the Solana network.
- **Solana CLI** (Optional): For additional keypair and network configurations.

---

## Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/Adarsh-Dhar/x402-solana.git
   cd x402-solana
   ```

2. Install dependencies:

   - For the SDK:
   
     ```bash
     pip install -r requirements.txt
     ```

   - For Node.js components:

     ```bash
     npm install
     ```

3. Configure Environment Variables:
   
   Add the following environment variables for your project:
   - `NEXT_PUBLIC_SOLANA_RPC_URL`: Specify Solana RPC URL.
   - `TREASURY_WALLET`: Specify the treasury's public key.

---

## Usage Instructions

### Python SDK Example

1. Import the module:

   ```python
   from human_rpc_sdk.solana_utils import create_payment_header
   ```

2. Build and process a transaction:

   ```python
   from solders.transaction import Transaction
   
   # Simulating a SOL Native Transaction:
   serialized_tx = "Base64_encoded_tx_here"
   payment_header = create_payment_header(serialized_tx, network="devnet")
   print(payment_header)
   ```

### API Integration Example

Use the backend's `processX402Payment` function to verify and execute transactions:

```typescript
import { processX402Payment } from "../app/api/v1/tasks/route"

// Initiates processing with existing header
const header = "<Serialized_X-PAYMENT_Header>";
const result = await processX402Payment(header, "SOL");
console.log(`Verified: ${result.verified}`);
```

---

## Testing the App

The repository includes test cases to validate key functionalities:

1. **Run Tests for SDK Components:**

   ```bash
   pytest main-app/sdk/tests/
   ```

2. **Backend API Tests:**

   To debug or simulate transactions, the backend integrates with test handlers.

---

## Key Files & Structure

- **`main-app/`**: Houses the primary implementation for the app.
  - **SDK**: Solana-specific utility modules.
  - **API**: Demos API for processing and integrating payments.
- **`test-agent/`**: SDK Test cases and example toolchains.
- **`LICENSE`**: Distributed under the MIT License.

---

## Troubleshooting

- **Connection Issues**: Verify Solana RPC endpoints are responsive.
- **Invalid Transactions**: Ensure serialized transactions comply with the Solana transaction format.
- **Simulation Failures**: Use `simulateTransaction` for Solana debug.

---

## Documentation

- [SDK User Guide](https://github.com/Adarsh-Dhar/x402-solana/INSTRUCTIONS.md)

---

## License

This project is licensed under the MIT License. See LICENSE file for details.

---

## Contributing

We encourage the community to contribute to this repository. Submit bugs, feedback or pull requests to enhance the capability of **x402-solana**.

---
