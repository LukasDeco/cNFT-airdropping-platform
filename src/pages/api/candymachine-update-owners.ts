import type { NextApiRequest, NextApiResponse } from 'next';
import { ShyftSdk, Network, CandyMachineProgram } from '@shyft-to/js';
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_SUPABASE_DB_URL ?? '';
const supabaseKey = process.env.NEXT_SUPABASE_DB_KEY ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

const shyftClient = new ShyftSdk({ apiKey: process.env.NEXT_SHYFT_API_KEY ?? '', network: Network.Devnet });

type ShyftArrayResultResponse = {
    success: boolean;
    message?: string;
    result: object[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ShyftArrayResultResponse>) {
    try {
        var cm_address: string = '';
        var network: string = '';
        var version: string = "";

        cm_address = typeof req.body.cm_address === 'string' ? req.body.cm_address : '';
        network = typeof req.body.network === 'string' ? req.body.network : 'mainnet-beta';
        version = typeof req.body.version === 'string' ? req.body.version : 'v3';

        var shyftNetwork: Network = Network.Mainnet;
        if (network === 'mainnet-beta') shyftNetwork = Network.Mainnet;
        else if (network === 'devnet') shyftNetwork = Network.Devnet;
        else if (network === 'testnet') shyftNetwork = Network.Testnet;
        else throw new Error('WRONG_NETWORK');
        var cmMints: string[];

        const cm_version = (version === "v3") ? CandyMachineProgram.V3 : CandyMachineProgram.V2;

        try {
            cmMints = await shyftClient.candyMachine.readMints({
                network: shyftNetwork,
                address: cm_address,
                version: cm_version,
            });
        } catch (error) {
            throw Error('WRONG_ADDR');
        }

        // console.log("here2.1");
        // console.log(getMintsFromCandyMachine);
        // console.log("here3");

        if (!cmMints || cmMints.length == 0) {
            throw new Error('NO_NFTS_IN_CM');
        }


        // do random crap
        const nfts = await getNftsInCollection(shyftNetwork, cm_address)
        const dbUpdateSuccess = await pushNftDataToDatabase(cm_address, nfts, shyftNetwork);
        if (!dbUpdateSuccess) {
            throw new Error('FAILED_TO_UPDATE_DB');
        }

        res.status(200).json({
            success: true,
            message: 'All Nfts in this CM',
            result: cmMints as any[],
        });
    } catch (error: any) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: 'Test',
            result: [],
        });
    }
}

async function getNftsInCollection(shyftNetwork: Network, referenceAddress: string): Promise<string[]> {
    let mints = [];
    let currentPage = 0;
    let totalPages = 0;
    {
        const getNftsInCollection = await shyftClient.nft.collection.getNfts({
            network: shyftNetwork,
            collectionAddress: referenceAddress,
            size: 10,
            page: currentPage
        });


        if (totalPages === 0)
            totalPages = getNftsInCollection.total_pages;
        const nftReceived: any[] = getNftsInCollection.nfts;
        for (let index = 0; index < nftReceived.length; index++) {
            const nftElement: string = nftReceived[index].mint;
            mints.push(nftElement);
        }


        currentPage++;
    } while (currentPage < totalPages);

    return mints;
}

async function pushNftDataToDatabase(referenceAddress: string, addresses_to_monitor: string[], network: Network): Promise<boolean> {
    try {
        if (addresses_to_monitor.length > 0) {
            if (referenceAddress && addresses_to_monitor.length && network) {
                const nftOwners = await shyftClient.nft.getOwners({ network: network, mints: addresses_to_monitor });
                console.log(nftOwners);
                if (nftOwners.length === 0)
                    throw new Error('NO_NFT_DATA');


                const allOwners: object[] = nftOwners;
                // const allOwners:object[] = [];
                for (var i = 0; i < allOwners.length; i++) {
                    const eachOwner: any = allOwners[i];
                    //fetch NFT metadata here
                    const insertToDb = await supabase.from('monitor_mints').upsert({
                        mint_address: eachOwner.nft_address,
                        current_holder: eachOwner.owner
                    });
                    if (insertToDb.error !== null)
                        throw new Error('INSERT_TO_DB_FAILED');
                }
                return true;
            }
        }
        else {
            return false;
        }
        return true;
    } catch (error: any) {
        console.log(error);
        return false;
    }
}
