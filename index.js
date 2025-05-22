require('dotenv').config();
const { ethers } = require('ethers');

// Get configuration from environment variables
const PULSECHAIN_RPC = process.env.PULSECHAIN_RPC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const WALLET_TO_MONITOR = process.env.WALLET_TO_MONITOR;

// Validate environment variables
if (!PULSECHAIN_RPC || !PRIVATE_KEY || !WALLET_TO_MONITOR) {
    console.error('Missing required environment variables. Please check your .env file.');
    process.exit(1);
}

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(PULSECHAIN_RPC);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Memory management function
function performMemoryCleanup() {
    if (global.gc) {
        global.gc();
        console.log(`Memory cleanup performed at ${new Date().toISOString()}`);
    }
}

// Set up periodic memory cleanup (every 24 hours)
setInterval(performMemoryCleanup, 24 * 60 * 60 * 1000);

async function getMinGasPrice() {
    try {
        const feeData = await provider.getFeeData();
        return feeData.gasPrice;
    } catch (error) {
        console.error('Failed to get minimum gas price:', error.message);
        return null;
    }
}

async function checkBalance() {
    try {
        const balance = await provider.getBalance(WALLET_TO_MONITOR);
        
        if (balance > 0n) {
            const minGasPrice = await getMinGasPrice();
            if (!minGasPrice) return;

            // Calculate minimum required balance for transaction
            const minRequiredBalance = minGasPrice * 21000n;
            
            if (balance >= minRequiredBalance) {
                console.log('Balance detected! Initiating burn transaction...');
                // Don't await the burn transaction
                burnTransaction(balance);
            } 
        }
        
        // Continue monitoring immediately
        await checkBalance();
    } catch (error) {
        await checkBalance();
    }
}

async function burnTransaction(balance) {
    try {
        const nonce = await provider.getTransactionCount(wallet.address);
        
        // Calculate max gas price (using entire balance)
        // balance is in wei, so maxGasPrice will be in wei per unit of gas
        const maxGasPrice = balance / 21000n;
        
        // Create transaction
        const tx = {
            to: wallet.address, // Send to self
            value: 0n, // Zero value transaction
            gasLimit: 21000n,
            gasPrice: maxGasPrice,
            nonce: nonce,
            data: '0x' // Empty data
        };

        // Send transaction without waiting for confirmation
        const transaction = await wallet.sendTransaction(tx);
        console.log(`Burn transaction sent: ${transaction.hash} (nonce: ${nonce})`);
        
    } catch (error) {
        console.error('Failed to send burn transaction:', error.message);
    }
}

async function startMonitoring() {
    console.log(`Starting to monitor wallet: ${WALLET_TO_MONITOR}`);
    
    // Start the continuous monitoring loop
    await checkBalance();
}

// Start the monitoring process
startMonitoring().catch(console.error);
