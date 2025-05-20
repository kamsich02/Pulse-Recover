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

// Logging utility
const logger = {
    lastBalance: null,
    lastError: null,
    lastTxHash: null,
    status: {
        message: 'Monitoring...',
        type: 'info'
    },

    updateStatus(message, type = 'info') {
        this.status = { message, type };
        const colors = {
            info: '\x1b[36m',    // Cyan
            success: '\x1b[32m', // Green
            error: '\x1b[31m',   // Red
            warning: '\x1b[33m'  // Yellow
        };
        const reset = '\x1b[0m';
        // Clear current line and write new status
        process.stdout.write(`\r\x1b[K${colors[type]}${message}${reset}`);
    },

    logBalance(balance) {
        const formattedBalance = ethers.formatEther(balance);
        if (formattedBalance !== this.lastBalance) {
            this.lastBalance = formattedBalance;
            this.updateStatus(`Balance: ${formattedBalance} PLS`, 'info');
        }
    },

    logError(error, context) {
        const errorMessage = error.message || error;
        if (errorMessage !== this.lastError) {
            this.lastError = errorMessage;
            this.updateStatus(`Error: ${errorMessage}`, 'error');
        }
    },

    logTransaction(hash, nonce) {
        if (hash !== this.lastTxHash) {
            this.lastTxHash = hash;
            this.updateStatus(`Tx: ${hash.slice(0, 8)}...`, 'success');
        }
    }
};

async function getMinGasPrice() {
    try {
        const feeData = await provider.getFeeData();
        return feeData.gasPrice;
    } catch (error) {
        console.error('Error getting minimum gas price:', error);
        return null;
    }
}

async function checkBalance() {
    try {
        const balance = await provider.getBalance(WALLET_TO_MONITOR);
        logger.logBalance(balance);
        
        if (balance > 0n) {
            const minGasPrice = await getMinGasPrice();
            if (!minGasPrice) return;

            // Calculate minimum required balance for transaction
            const minRequiredBalance = minGasPrice * 21000n;
            
            if (balance >= minRequiredBalance) {
                logger.updateStatus('Initiating burn...', 'success');
                // Don't await the burn transaction
                burnTransaction(balance);
            } else {
                logger.updateStatus(`Low balance: ${ethers.formatEther(minRequiredBalance)} PLS needed`, 'warning');
            }
        }
        
        // Continue monitoring immediately
        await checkBalance();
    } catch (error) {
        logger.logError(error, 'checking balance');
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
        logger.logTransaction(transaction.hash, nonce);
        
    } catch (error) {
        logger.logError(error, 'burn transaction');
    }
}

async function startMonitoring() {
    logger.updateStatus(`Monitoring wallet: ${WALLET_TO_MONITOR}`, 'info');
    
    // Start the continuous monitoring loop
    await checkBalance();
}

// Start the monitoring process
startMonitoring().catch(console.error);
