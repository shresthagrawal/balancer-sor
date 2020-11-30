// Example showing full swapExactIn - run using: $ ts-node ./test/testScripts/example-swapExactIn.ts
require('dotenv').config();
const sor = require('../../src');
const BigNumber = require('bignumber.js');
import { JsonRpcProvider } from '@ethersproject/providers';
import {
    BONE,
    MAX_IN_RATIO,
    MAX_OUT_RATIO,
    bmul,
    bdiv,
    bnum,
    calcOutGivenIn,
    calcInGivenOut,
    scale,
} from '../../src/bmath';

const provider = new JsonRpcProvider(
    `https://mainnet.infura.io/v3/${process.env.INFURA}` // If running this example make sure you have a .env file saved in root DIR with INFURA=your_key
);
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // DAI Address
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC Address
const AMPL = '0xd46ba6d942050d489dbd938a2c909a5d5039a161';
const amountIn = new BigNumber(1000e9); // AMPL has 9 decimals
const tokenIn = AMPL;
const tokenOut = USDC;
const swapType = 'swapExactIn';
const noPools = 4; // This determines how many pools the SOR will use to swap.
const gasPrice = new BigNumber('30000000000'); // You can set gas price to whatever the current price is.
const swapCost = new BigNumber('100000'); // A pool swap costs approx 100000 gas
// URL for pools data
const poolsUrl = `https://cloudflare-ipfs.com/ipns/balancer-team-bucket.storage.fleek.co/balancer-exchange/pools`;

async function swapExactIn() {
    // This calculates the cost to make a swap which is used as an input to SOR to allow it to make gas efficient recommendations
    const costOutputToken = await sor.getCostOutputToken(
        tokenOut,
        gasPrice,
        swapCost,
        provider
    );

    // Fetch all pools information
    const poolsHelper = new sor.POOLS();
    console.log('Fetching Pools...');
    let allPoolsNonZeroBalances = await poolsHelper.getAllPublicSwapPools(
        poolsUrl
    );

    /*
    console.log(`Retrieving Onchain Balances...`);
    allPoolsNonZeroBalances = await sor.getAllPoolDataOnChain(
        allPoolsNonZeroBalances,
        '0x514053acec7177e277b947b1ebb5c08ab4c4580e', // Address of Multicall contract
        provider
    );
    */

    allPoolsNonZeroBalances = await poolsHelper.formatPoolsBigNumber(
        allPoolsNonZeroBalances
    );

    console.log(`Processing Data...`);
    // Retrieves all pools that contain both DAI & USDC, i.e. pools that can be used for direct swaps
    // Retrieves intermediate pools along with tokens that are contained in these.
    let directPools, hopTokens, poolsTokenIn, poolsTokenOut;
    [directPools, hopTokens, poolsTokenIn, poolsTokenOut] = sor.filterPools(
        allPoolsNonZeroBalances.pools,
        tokenIn.toLowerCase(), // The Subgraph returns tokens in lower case format so we must match this
        tokenOut.toLowerCase(),
        noPools
    );

    // Sort intermediate pools by order of liquidity
    let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop;
    [
        mostLiquidPoolsFirstHop,
        mostLiquidPoolsSecondHop,
    ] = sor.sortPoolsMostLiquid(
        tokenIn,
        tokenOut,
        hopTokens,
        poolsTokenIn,
        poolsTokenOut
    );

    // Finds the possible paths to make the swap
    let pools, pathData;
    [pools, pathData] = sor.parsePoolData(
        directPools,
        tokenIn.toLowerCase(),
        tokenOut.toLowerCase(),
        mostLiquidPoolsFirstHop,
        mostLiquidPoolsSecondHop,
        hopTokens
    );

    // Finds sorted price & slippage information for paths
    let paths = sor.processPaths(pathData, pools, swapType);
    /*
    console.log(`PATHS ${paths.length}:`);
    paths.forEach(path => {
      console.log(path.id);
      console.log(path.swaps);
      console.log(path.spotPrice.toString());
      console.log(path.slippage.toString());
    });
    */

    let epsOfInterest = sor.processEpsOfInterestMultiHop(
        paths,
        swapType,
        noPools
    );
    /*
    console.log(`EPS:`);
    epsOfInterest.forEach(price => {
      console.log(price);
    })
    */

    // Returns  total amount of DAI swapped and list of swaps to make
    let swaps, totalReturnWei;
    [swaps, totalReturnWei] = sor.smartOrderRouterMultiHopEpsOfInterest(
        pools,
        paths,
        swapType,
        amountIn,
        noPools,
        costOutputToken,
        epsOfInterest
    );

    console.log(`Total Return: ${totalReturnWei.toString()}`);
    console.log(`Swaps: `);
    console.log(swaps);
}

swapExactIn();
