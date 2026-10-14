export interface paths {
    "/api/v1/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read activity from the local Observatory dataset */
        get: operations["activity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/blocks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["blocks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/blocks/{hash}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["block"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bmm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["bmm"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bmm/auctions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["auctions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bmm/commitments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read bmm/commitments from the local Observatory dataset */
        get: operations["bmm_commitments"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bmm/confirmed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read bmm/confirmed from the local Observatory dataset */
        get: operations["bmm_confirmed"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bmm/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read bmm/history from the local Observatory dataset */
        get: operations["bmm_history"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bundle-attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read bundle-attempts from the local Observatory dataset */
        get: operations["bundleattempts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bundle-attempts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read bundle-attempts/{id} from the local Observatory dataset */
        get: operations["bundleattempts_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/chain-info": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read chain-info from the local Observatory dataset */
        get: operations["chaininfo"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/coverage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["coverage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/ctip/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read ctip/history from the local Observatory dataset */
        get: operations["ctip_history"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/datasets/{dataset_id}/events/{event_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["evidence"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/datasets/{dataset_id}/events/{event_id}/raw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["raw_evidence"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/datasets/{dataset}/events/{id}/occurrences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read datasets/{dataset}/events/{id}/occurrences from the local Observatory dataset */
        get: operations["datasets_dataset_events_id_occurrences"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deposits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read deposits from the local Observatory dataset */
        get: operations["deposits"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read export from the local Observatory dataset */
        get: operations["export"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/meta": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["meta"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/network": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["network"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/observation-failures": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read observation-failures from the local Observatory dataset */
        get: operations["observationfailures"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/observations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read observations from the local Observatory dataset */
        get: operations["observations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/observatory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["observatory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["overview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/protocol-messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read protocol-messages from the local Observatory dataset */
        get: operations["protocolmessages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read runs from the local Observatory dataset */
        get: operations["runs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read runs/{id} from the local Observatory dataset */
        get: operations["runs_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read search from the local Observatory dataset */
        get: operations["search"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechain-instances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read sidechain-instances from the local Observatory dataset */
        get: operations["sidechaininstances"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechain-instances/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read sidechain-instances/{id} from the local Observatory dataset */
        get: operations["sidechaininstances_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechain-instances/{id}/ctip": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read sidechain-instances/{id}/ctip from the local Observatory dataset */
        get: operations["sidechaininstances_id_ctip"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechain-proposals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read sidechain-proposals from the local Observatory dataset */
        get: operations["sidechainproposals"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechain-proposals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read sidechain-proposals/{id} from the local Observatory dataset */
        get: operations["sidechainproposals_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechains": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["sidechains"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechains/{slot}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read sidechains/{slot} from the local Observatory dataset */
        get: operations["sidechains_slot"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechains/{slot}/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read sidechains/{slot}/activity from the local Observatory dataset */
        get: operations["sidechains_slot_activity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechains/{slot}/dataset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["sidechain_dataset"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechains/{slot}/instances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read sidechains/{slot}/instances from the local Observatory dataset */
        get: operations["sidechains_slot_instances"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sidechains/{slot}/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["sidechain_stats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/snapshot-groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read snapshot-groups from the local Observatory dataset */
        get: operations["snapshotgroups"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/snapshot-groups/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read snapshot-groups/{id} from the local Observatory dataset */
        get: operations["snapshotgroups_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["status"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/withdrawal-bundles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read withdrawal-bundles from the local Observatory dataset */
        get: operations["withdrawalbundles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/withdrawal-bundles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read withdrawal-bundles/{id} from the local Observatory dataset */
        get: operations["withdrawalbundles_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["live"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ready"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ApiError: {
            code: string;
            message: string;
            request_id?: string | null;
        };
        BidStats: {
            /** Format: int64 */
            committed_next_block: number;
            /**
             * Format: int64
             * @description Distinct bids the monitor saw, and the parent blocks they were made on.
             */
            count: number;
            /** Format: int32 */
            last_parent_height?: number | null;
            last_sats?: string | null;
            max_sats?: string | null;
            median_sats?: string | null;
            /**
             * Format: int64
             * @description Bids whose next block was observed, and how many of those committed to the bid's critical hash.
             */
            next_block_observed: number;
            /** Format: int64 */
            parent_blocks: number;
        };
        BlockFact: {
            /** Format: int32 */
            contract: number;
            event_id: string;
            /** Format: date-time */
            ingested_at: string;
            instance_id?: string | null;
            interpretation_error?: string | null;
            kind: string;
            /** Format: date-time */
            observed_at: string;
            /** Format: int32 */
            slot?: number | null;
        };
        BlockObservation: {
            capture_method: string;
            capture_seq: string;
            event_id: string;
            kind: string;
            observation_id: string;
            /** Format: date-time */
            observed_at: string;
            /** Format: uuid */
            run_id: string;
            /** Format: int32 */
            slot?: number | null;
        };
        BlockResponse: {
            block: components["schemas"]["BlockSummary"];
            branch: components["schemas"]["BranchState"];
            facts: components["schemas"]["BlockFact"][];
            facts_truncated: boolean;
            meta: components["schemas"]["ResponseMeta"];
            observations: components["schemas"]["BlockObservation"][];
            observations_truncated: boolean;
        };
        BlockSummary: {
            /** Format: date-time */
            block_time: string;
            block_work?: string | null;
            chain_work: string;
            conflicted: boolean;
            /** Format: date-time */
            first_observed_at: string;
            hash: string;
            /** Format: int32 */
            height: number;
            /** Format: date-time */
            last_observed_at: string;
            membership: string;
            parent_hash: string;
        };
        BlocksResponse: {
            blocks: components["schemas"]["BlockSummary"][];
            branch: components["schemas"]["BranchState"];
            meta: components["schemas"]["ResponseMeta"];
            next_cursor?: string | null;
        };
        BmmAuctionsResponse: {
            bid_coverage: string;
            evidence_url?: string | null;
            /** @description Official GetSeenBmmRequests exposes neither readiness nor total mempool coverage. */
            mempool_readiness: string;
            meta: components["schemas"]["ResponseMeta"];
            observation_id?: string | null;
            /** Format: date-time */
            observed_at?: string | null;
            parent_hash?: string | null;
            requests: components["schemas"]["BmmBid"][];
            /** Format: uuid */
            run_id?: string | null;
            source_event_id?: string | null;
            /**
             * @description available, no_observed_bids, stale, unavailable, awaiting_observation, rpc_error,
             *     interpretation_error, or awaiting_current_parent.
             */
            state: string;
        };
        BmmBid: {
            bid_sats: string;
            critical_hash: string;
            /** Format: int32 */
            slot: number;
            txid: string;
        };
        BmmCell: {
            commitment?: string | null;
            evidence: components["schemas"]["ProtocolEvidence"][];
            hash?: string | null;
            /** Format: int32 */
            height: number;
            /** @description present, observed_absent, uncovered, inactive, unknown_eligibility. */
            state: string;
        };
        BmmGap: {
            /** Format: int32 */
            blocks: number;
            /** Format: int32 */
            from_height: number;
            /** Format: int32 */
            to_height: number;
        };
        BmmMetricsResponse: {
            context: components["schemas"]["ProtocolContext"];
            /** Format: int32 */
            next_slot?: number | null;
            slots: components["schemas"]["BmmSlotMetrics"][];
            /** Format: int32 */
            window_blocks: number;
        };
        BmmSlotMetrics: {
            cells: components["schemas"]["BmmCell"][];
            /** Format: int32 */
            consecutive_present: number;
            /** Format: double */
            coverage?: number | null;
            /** Format: int32 */
            covered: number;
            /** Format: int32 */
            eligible?: number | null;
            /** Format: int32 */
            present: number;
            /** Format: double */
            rate?: number | null;
            /** Format: int32 */
            slot: number;
        };
        BmmStats: {
            /** Format: int32 */
            blocks_since_last_commit?: number | null;
            /** Format: int32 */
            last_commit_height?: number | null;
            longest_gap?: null | components["schemas"]["BmmGap"];
            since_activation?: null | components["schemas"]["BmmWindowStats"];
            /**
             * Format: int32
             * @description Consecutive committing blocks ending at the anchor.
             */
            streak: number;
            /** @description 24, 144 and 1008 blocks. */
            windows: components["schemas"]["BmmWindowStats"][];
        };
        BmmWindowStats: {
            /**
             * Format: int32
             * @description Newest L1 blocks counted; for `since_activation`, the blocks from activation through the anchor.
             */
            blocks: number;
            /**
             * Format: int32
             * @description Blocks whose merged-mining facts for this slot were observed.
             */
            covered: number;
            /**
             * Format: int32
             * @description Observed blocks that committed to a block of this sidechain.
             */
            present: number;
        };
        BranchCoverage: {
            branch_revision: string;
            covered_blocks: string;
            /** Format: int32 */
            first_gap_height?: number | null;
            status: string;
            /** Format: int32 */
            verified_from_height?: number | null;
            /** Format: int32 */
            verified_through_height?: number | null;
        };
        /** @description A branch verdict is bounded by its verified lower boundary, not consensus finality. */
        BranchState: {
            basis: string;
            capture_seq: string;
            checkpoint_status: string;
            evidence_id?: string | null;
            evidence_type?: string | null;
            /** @description matched, different_tips, or unknown. Does not change the selected enforcer branch. */
            joint_source_status?: string;
            missing_parent?: string | null;
            node_tip_hash?: string | null;
            /** Format: int32 */
            node_tip_height?: number | null;
            /** Format: date-time */
            observed_at?: string | null;
            processed_coverage: string;
            processed_events: string;
            processed_observations: string;
            processed_tips: string;
            processing: boolean;
            revision: string;
            /** Format: uuid */
            run_id?: string | null;
            status: string;
            tip_hash?: string | null;
            /** Format: int32 */
            tip_height?: number | null;
            /** Format: int32 */
            verified_from_height?: number | null;
        };
        /** @description Where a pending withdrawal bundle stands against the threshold, at the pace votes have come so far. */
        BundleProjection: {
            /** Format: int64 */
            age?: number | null;
            /** Format: int64 */
            blocks_left?: number | null;
            /** Format: int64 */
            blocks_to_pass_at_rate?: number | null;
            /** @description At most one vote per block: false when even every remaining block cannot reach the threshold. */
            can_still_pass?: boolean | null;
            /**
             * Format: int32
             * @description The tip of the latest complete reading that still found this vote count; `age`,
             *     `blocks_left` and the rates are measured at this tip.
             */
            confirmed_at_tip_height?: number | null;
            /** Format: int64 */
            expires_after_height?: number | null;
            m6id_onchain?: string | null;
            m6id_txid_order?: string | null;
            /** Format: int64 */
            max_age?: number | null;
            /** Format: int64 */
            needed?: number | null;
            passes_at_rate?: boolean | null;
            /** Format: int32 */
            proposal_height?: number | null;
            quality: string;
            /**
             * Format: double
             * @description Change in votes over the readings of about the last 144 blocks, per block.
             */
            rate_recent?: number | null;
            /**
             * Format: double
             * @description Votes divided by age.
             */
            rate_since_proposal?: number | null;
            /**
             * Format: int32
             * @description The tip where this vote count was first read.
             */
            read_at_tip_height?: number | null;
            /**
             * Format: int64
             * @description Votes must exceed the threshold, so `needed` is threshold + 1 - votes.
             */
            threshold?: number | null;
            /** Format: int64 */
            votes?: number | null;
        };
        CoverageResponse: {
            branch: components["schemas"]["BranchState"];
            local_status: string;
            meta: components["schemas"]["ResponseMeta"];
            observation_quality: unknown;
            snapshot_history: string;
            streams: components["schemas"]["CoverageScope"][];
            /**
             * @description Subscription boundaries of the global transition stream, newest first:
             *     each bounds an interval whose connects and disconnects are unknown.
             */
            transition_gaps: unknown;
        };
        CoverageScope: {
            /** Format: date-time */
            changed_at: string;
            /** Format: int32 */
            covered_height?: number | null;
            /** Format: int32 */
            event_contract_version: number;
            instance_id?: string | null;
            revision_id: string;
            /** Format: int32 */
            slot?: number | null;
            source_status: string;
            /** Format: int32 */
            start_height?: number | null;
            stream: string;
            /** Format: int32 */
            target_height?: number | null;
            verification?: null | components["schemas"]["BranchCoverage"];
        };
        Dataset: {
            activation_block_hash: string;
            /** Format: int32 */
            activation_height: number;
            capabilities: unknown;
            /** Format: date-time */
            created_at: string;
            /** Format: uuid */
            dataset_id: string;
            network_id: string;
        };
        /** @description One column of a dataset table and what it means. */
        DatasetColumn: {
            description: string;
            name: string;
        };
        /** @description Records of one kind as typed columns, oldest first. */
        DatasetTable: {
            columns: components["schemas"]["DatasetColumn"][];
            description: string;
            /** @description File name without extension, such as `deposits`. */
            name: string;
            /** @description One cell per column, as text; null when unknown. Satoshi amounts are exact integers. */
            rows: (string | null)[][];
            /** @description More records exist than the table holds: narrow the height range. */
            truncated: boolean;
        };
        DepositStats: {
            /** Format: int64 */
            count: number;
            /** Format: int32 */
            first_height?: number | null;
            /**
             * Format: int64
             * @description Deposits whose miner-set block time is within the last 1, 7 and 30 days of `generated_at`.
             */
            last_24h: number;
            /** Format: int64 */
            last_30d: number;
            /** Format: int64 */
            last_7d: number;
            /** Format: date-time */
            last_block_time?: string | null;
            /** Format: int32 */
            last_height?: number | null;
            max_sats?: string | null;
            median_sats?: string | null;
            total_sats: string;
        };
        EpochPace: {
            /**
             * Format: int32
             * @description Blocks of the window inside the epoch.
             */
            blocks: number;
            /**
             * Format: double
             * @description Difficulty of the epoch divided by the difficulty before it.
             */
            difficulty_change?: number | null;
            /**
             * Format: int32
             * @description The epoch's first block.
             */
            from_height: number;
            /** Format: double */
            hashrate_hps?: number | null;
            /** Format: double */
            interval_mean_seconds?: number | null;
            /** Format: double */
            interval_median_seconds?: number | null;
        };
        EvidenceOccurrence: {
            capture_method: string;
            capture_seq: string;
            observation_id: string;
            /** Format: date-time */
            observed_at: string;
            /** Format: uuid */
            run_id: string;
            /** Format: uuid */
            snapshot_group_id?: string | null;
        };
        EvidenceResponse: {
            envelope_hex: string;
            /** Format: int32 */
            event_contract_version: number;
            fact_sha256?: string | null;
            interpretation_error?: string | null;
            kind: string;
            meta: components["schemas"]["ResponseMeta"];
            occurrences: components["schemas"]["EvidenceOccurrence"][];
            occurrences_truncated: boolean;
            /** @description JSON text, deliberately not a JS-number-bearing object. Copy verbatim. */
            payload_json: string;
            /**
             * @description True for a node raw block imported without its body: `envelope_hex` is
             *     empty and `payload_json` lacks `raw_block`. `fact_sha256` still hashes
             *     the full source block.
             */
            raw_block_omitted: boolean;
            source_event_id: string;
        };
        ExtractorStatus: {
            last_error?: string | null;
            last_tip_hash?: string | null;
            /** Format: int32 */
            last_tip_height?: number | null;
            /** Format: uuid */
            run_id: string;
            source: string;
            /** Format: date-time */
            source_updated_at: string;
            workers: components["schemas"]["WorkerStatus"][];
        };
        FamilyProgress: {
            family: string;
            first_error_event_id?: string | null;
            processed_event_id?: string | null;
        };
        MetaResponse: {
            current_run?: null | components["schemas"]["RunInfo"];
            dataset: components["schemas"]["Dataset"];
            meta: components["schemas"]["ResponseMeta"];
            native_asset: components["schemas"]["NativeAsset"];
            /** Format: int32 */
            source_schema_version?: number | null;
        };
        NativeAsset: {
            /** Format: int32 */
            decimals: number;
            symbol: string;
        };
        NetworkBlock: {
            /** Format: int32 */
            bid_slots?: number | null;
            bid_total_sats?: string | null;
            /**
             * Format: int32
             * @description Merged-mining bids the monitor saw for this block (made on its parent), across slots; null when it saw none.
             */
            bids?: number | null;
            /** Format: date-time */
            block_time?: string | null;
            block_work?: string | null;
            chain_work?: string | null;
            /**
             * Format: double
             * @description block_work × 65535 / 2^48, the usual difficulty scale.
             */
            difficulty?: number | null;
            hash: string;
            /** Format: int32 */
            height: number;
            /**
             * Format: int64
             * @description Seconds since the previous block by miner-set timestamps; can be negative.
             */
            interval_seconds?: number | null;
            top_bid_sats?: string | null;
        };
        /** @description L1 block pace, difficulty and estimated hashrate from the selected chain's headers. */
        NetworkResponse: {
            /**
             * Format: int32
             * @description Selected headers in the window; fewer than `window_blocks` when the chain is shorter or headers are missing.
             */
            blocks: number;
            branch: components["schemas"]["BranchState"];
            current_epoch?: null | components["schemas"]["EpochPace"];
            /**
             * Format: double
             * @description Work of the window's blocks after the first, divided by the time between the first and the last.
             */
            hashrate_hps?: number | null;
            /** Format: double */
            interval_mean_seconds?: number | null;
            /** Format: double */
            interval_median_seconds?: number | null;
            meta: components["schemas"]["ResponseMeta"];
            notes: string[];
            retarget?: null | components["schemas"]["RetargetEpoch"];
            /** @description Newest first. */
            series: components["schemas"]["NetworkBlock"][];
            tip?: null | components["schemas"]["NetworkBlock"];
            /** Format: int32 */
            window_blocks: number;
        };
        ObservatoryResponse: {
            context: components["schemas"]["ProtocolContext"];
            /**
             * @description Latest occurrence for each snapshot kind/slot in the current run, including
             *     inconsistent observations. A bad latest snapshot never falls back silently.
             */
            observations: components["schemas"]["ProtocolItem"][];
            /**
             * @description Separate latest official responses. These are not atomic state at the selected block;
             *     absence from an incomplete map does not mean zero or inactive.
             */
            state: unknown;
        };
        ObservedBlock: {
            branch_status: string;
            hash: string;
            /** Format: int32 */
            height: number;
            /** Format: date-time */
            observed_at: string;
        };
        OverviewResponse: {
            /** Format: int64 */
            active_sidechains?: number | null;
            branch: components["schemas"]["BranchState"];
            latest_observed_block?: null | components["schemas"]["ObservedBlock"];
            meta: components["schemas"]["ResponseMeta"];
            /** Format: int64 */
            pending_proposals?: number | null;
            /** Format: int64 */
            pending_withdrawal_bundles?: number | null;
            source_events_imported: string;
            source_observations_imported: string;
        };
        ProjectionProgress: {
            error_event_id?: string | null;
            name: string;
            processed_event_id?: string | null;
        };
        ProtocolContext: {
            anchor_hash?: string | null;
            /** Format: int32 */
            anchor_height?: number | null;
            branch: components["schemas"]["BranchState"];
            build_id?: string | null;
            families: components["schemas"]["FamilyProgress"][];
            meta: components["schemas"]["ResponseMeta"];
            /** @description Explanation when the reviewed semantic adapter cannot be applied. */
            semantics_issue?: string | null;
            semantics_supported: boolean;
            semantics_version: string;
            /** @description Immutable imported-event cut of this build, distinct from completeness. */
            source_event_cut?: string | null;
            /** @description awaiting_data, catching_up, available, partial, or ambiguous. */
            state: string;
        };
        ProtocolEvidence: {
            event_id: string;
            observation_id?: string | null;
            /** Format: int32 */
            ordinal: number;
        };
        ProtocolItem: {
            /** Format: date-time */
            block_time?: string | null;
            /** @description Typed monitor interpretation; monetary amounts and u64 values are strings. */
            data: unknown;
            entity_id?: string | null;
            evidence: components["schemas"]["ProtocolEvidence"][];
            /**
             * Format: date-time
             * @description When the immutable fact was first recorded, if the list reports it.
             */
            first_observed_at?: string | null;
            hash?: string | null;
            /** Format: int32 */
            height?: number | null;
            id: string;
            /** @description Whether this entity is established at the published anchor; null if unknown. */
            is_current?: boolean | null;
            issue?: string | null;
            kind: string;
            /** @description selected, alternative, unknown, or not_applicable. */
            membership: string;
            /**
             * Format: date-time
             * @description The latest occurrence of this item (when it was last read).
             */
            observed_at?: string | null;
            /** @description observed, tip_matched, unknown. Raw evidence is available separately. */
            quality: string;
            /** Format: int32 */
            slot?: number | null;
        };
        ProtocolPage: {
            context: components["schemas"]["ProtocolContext"];
            items: components["schemas"]["ProtocolItem"][];
            next_cursor?: string | null;
        };
        ResponseMeta: {
            data_as_of_event_id?: string | null;
            /** Format: uuid */
            dataset_id: string;
            network_id: string;
            projection_generation: string;
            /** Format: int32 */
            projection_version: number;
            pulse_revision: string;
        };
        RetargetEpoch: {
            /** Format: int32 */
            blocks_into_epoch: number;
            /** Format: int32 */
            blocks_remaining: number;
            /** Format: int32 */
            epoch_start_height: number;
            /** Format: date-time */
            epoch_start_time?: string | null;
            /**
             * Format: double
             * @description target spacing / mean spacing, limited to 0.25–4 like the retarget rule; noisy early in an epoch.
             */
            estimated_adjustment?: number | null;
            /** Format: int32 */
            interval_blocks: number;
            /**
             * Format: double
             * @description Mean seconds per block in this epoch so far.
             */
            mean_spacing_seconds?: number | null;
            /** Format: int32 */
            next_retarget_height: number;
            /** Format: int64 */
            target_spacing_seconds: number;
        };
        RunInfo: {
            capabilities: unknown;
            enforcer_commit: string;
            /** Format: int32 */
            event_contract_version: number;
            monitor_commit: string;
            node_commit: string;
            /** Format: uuid */
            run_id: string;
            status: string;
        };
        /** @description Everything the Observatory holds about one sidechain slot, read from a single build. */
        SidechainDataset: {
            context: components["schemas"]["ProtocolContext"];
            /** Format: int32 */
            from_height?: number | null;
            /** Format: date-time */
            generated_at: string;
            /** @description Limits a reader must know before drawing conclusions from the tables. */
            notes: string[];
            /** Format: int32 */
            slot: number;
            tables: components["schemas"]["DatasetTable"][];
            /** Format: int32 */
            to_height?: number | null;
        };
        /** @description Figures about one sidechain slot, all computed from the records of a single build. */
        SidechainStats: {
            /**
             * Format: int32
             * @description Activation height of the sidechain now in the slot, if one is active.
             */
            activation_height?: number | null;
            bids: components["schemas"]["BidStats"];
            bmm: components["schemas"]["BmmStats"];
            context: components["schemas"]["ProtocolContext"];
            deposits: components["schemas"]["DepositStats"];
            /** Format: date-time */
            generated_at: string;
            /** @description Limits a reader must know before drawing conclusions from these figures. */
            notes: string[];
            series: components["schemas"]["StatsBlock"][];
            /** Format: int32 */
            slot: number;
            treasury: components["schemas"]["TreasuryStats"];
            /** @description More records exist than one computation reads; counts are lower bounds. */
            truncated: boolean;
            /**
             * Format: int32
             * @description The `window_blocks` newest L1 blocks, newest first.
             */
            window_blocks: number;
            withdrawals: components["schemas"]["WithdrawalStats"];
        };
        SidechainSummary: {
            /** Format: int32 */
            activation_height: number;
            description?: string | null;
            instance_id: string;
            is_current: boolean;
            /** Format: int32 */
            proposal_height: number;
            /** Format: int32 */
            slot: number;
            title?: string | null;
        };
        SidechainsResponse: {
            complete: boolean;
            meta: components["schemas"]["ResponseMeta"];
            sidechains: components["schemas"]["SidechainSummary"][];
            state: string;
        };
        /** @description One L1 block for one slot. */
        StatsBlock: {
            /** @description Whether this block committed to the critical hash of one of those bids. */
            bid_committed?: boolean | null;
            /**
             * Format: int32
             * @description Bids seen on the parent block, that is, offered for this block.
             */
            bids: number;
            /** @description null when the block's merged-mining facts were not observed. */
            committed?: boolean | null;
            hash?: string | null;
            /** Format: int32 */
            height: number;
            top_bid_sats?: string | null;
        };
        StatusResponse: {
            branch: components["schemas"]["BranchState"];
            cursors: components["schemas"]["StreamProgress"][];
            extractors: components["schemas"]["ExtractorStatus"][];
            /** Format: date-time */
            last_cycle_at?: string | null;
            /** Format: date-time */
            last_projection_update_at?: string | null;
            /** Format: date-time */
            last_source_contact_at?: string | null;
            latest_observed_block?: null | components["schemas"]["ObservedBlock"];
            meta: components["schemas"]["ResponseMeta"];
            progress: components["schemas"]["ProjectionProgress"][];
            source_reachable: boolean;
            /** Format: int64 */
            stale_after_seconds: number;
            sync_mode: components["schemas"]["SyncMode"];
            sync_stale: boolean;
        };
        StreamProgress: {
            imported_through: string;
            source_high_water?: string | null;
            stream: string;
        };
        /** @description What L1 blocks of one recent period recorded, every figure counted over the same heights. */
        SummaryResponse: {
            context: components["schemas"]["ProtocolContext"];
            window?: null | components["schemas"]["SummaryWindow"];
        };
        SummaryWindow: {
            /**
             * Format: int64
             * @description Heights in the range, and how many of them are on the selected branch the Observatory holds.
             */
            blocks: number;
            /** Format: int64 */
            blocks_on_branch: number;
            /** Format: int64 */
            bmm_committed_blocks: number;
            /**
             * Format: int64
             * @description Blocks whose merged-mining facts the enforcer reported, and how many of those committed to a sidechain block.
             */
            bmm_observed_blocks: number;
            /** @description The weakest quality among the deposits counted, or none when there are none. */
            deposit_quality?: string | null;
            deposited_sats: string;
            /** Format: int64 */
            deposits: number;
            /** Format: date-time */
            from_block_time?: string | null;
            /**
             * Format: int32
             * @description The first selected block whose miner-set timestamp is inside the period, through the anchor. Block times are
             *     not monotonic, so a block in this range may carry an earlier timestamp.
             */
            from_height: number;
            /** Format: int32 */
            hours: number;
            /** Format: int64 */
            payouts_failed: number;
            /** Format: int64 */
            payouts_succeeded: number;
            /**
             * Format: date-time
             * @description Start of the period, by the database clock.
             */
            since: string;
            /** Format: date-time */
            to_block_time?: string | null;
            /** Format: int32 */
            to_height: number;
            /** @description More records than one response holds: counts are lower bounds. */
            truncated: boolean;
        };
        /** @enum {string} */
        SyncMode: "bootstrap" | "catching_up" | "following" | "interrupted" | "incompatible";
        TreasuryStats: {
            /**
             * Format: int32
             * @description The tip of the latest complete reading that still found this value.
             */
            confirmed_at_tip_height?: number | null;
            quality?: string | null;
            /**
             * Format: int32
             * @description The tip where this treasury value was first read.
             */
            read_at_tip_height?: number | null;
            sequence?: string | null;
            /** @description Each deposit and paid withdrawal replaced the treasury output; oldest first. */
            steps: components["schemas"]["TreasuryStep"][];
            /** @description The latest treasury reading; null when no reading exists or the treasury is empty. */
            value_sats?: string | null;
        };
        TreasuryStep: {
            /** @description deposit or withdrawal. */
            change: string;
            /** @description The deposited amount; null for a withdrawal, whose amount L1 records do not state here. */
            delta_sats?: string | null;
            /** Format: int32 */
            height?: number | null;
            sequence?: string | null;
            txid?: string | null;
            /** @description From a treasury reading of this output, or from the previous known value plus a deposit; null when unknown. */
            value_after_sats?: string | null;
        };
        WithdrawalStats: {
            /** Format: int64 */
            failed: number;
            pending: components["schemas"]["BundleProjection"][];
            /** Format: int64 */
            submitted: number;
            /** Format: int64 */
            succeeded: number;
        };
        WorkerStatus: {
            /** Format: int32 */
            consecutive_failures: number;
            last_error?: string | null;
            /** Format: date-time */
            last_failure_at?: string | null;
            /** Format: date-time */
            last_success_at?: string | null;
            /** Format: date-time */
            source_updated_at: string;
            state: string;
            worker: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    activity: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    blocks: {
        parameters: {
            query?: {
                dataset?: string;
                /** @description selected (default) or all observations. */
                scope?: string;
                height?: number;
                slot?: number;
                /** @description Default 50, maximum 200. */
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BlocksResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    block: {
        parameters: {
            query?: {
                dataset?: string;
            };
            header?: never;
            path: {
                hash: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BlockResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    bmm: {
        parameters: {
            query?: {
                dataset?: string;
                window_blocks?: number;
                slot?: number;
                start_slot?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BmmMetricsResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    auctions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BmmAuctionsResponse"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    bmm_commitments: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    bmm_confirmed: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    bmm_history: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    bundleattempts: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    bundleattempts_id: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chaininfo: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    coverage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageResponse"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    ctip_history: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    evidence: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                dataset_id: string;
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EvidenceResponse"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    raw_evidence: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                dataset_id: string;
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    datasets_dataset_events_id_occurrences: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                id: string;
                dataset: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    deposits: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    list: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    export: {
        parameters: {
            query: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
                resource: string;
                format?: "json" | "csv";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        context: components["schemas"]["ProtocolContext"];
                        items: components["schemas"]["ProtocolItem"][];
                        truncated: boolean;
                    };
                    "text/csv": string;
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    meta: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MetaResponse"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    network: {
        parameters: {
            query?: {
                dataset?: string;
                /** @description Blocks to measure pace and hashrate over: 144 (default), 1008 or 2016. */
                window_blocks?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetworkResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    observationfailures: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    observations: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    observatory: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ObservatoryResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    overview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OverviewResponse"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    protocolmessages: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    runs: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    runs_id: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    search: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechaininstances: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechaininstances_id: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechaininstances_id_ctip: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechainproposals: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechainproposals_id: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechains: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SidechainsResponse"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechains_slot: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                slot: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ObservatoryResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechains_slot_activity: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                slot: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechain_dataset: {
        parameters: {
            query?: {
                dataset?: string;
                /** @description First L1 height to include. Snapshot readings filter by the tip they were read at. */
                from_height?: number;
                to_height?: number;
                /** @description zip (default): one CSV per table plus manifest.json with row counts and SHA-256; json: the same tables in one document */
                format?: string;
            };
            header?: never;
            path: {
                /** @description BIP300 slot, 0 to 255 */
                slot: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description JSON shown; format=zip returns application/zip */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SidechainDataset"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechains_slot_instances: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                slot: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    sidechain_stats: {
        parameters: {
            query?: {
                dataset?: string;
                /** @description Blocks in `series`: 144 (default) or 1008. */
                window_blocks?: number;
            };
            header?: never;
            path: {
                /** @description BIP300 slot, 0 to 255 */
                slot: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SidechainStats"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    snapshotgroups: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    snapshotgroups_id: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    status: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StatusResponse"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    summary: {
        parameters: {
            query?: {
                dataset?: string;
                /** @description Length of the period in hours, 1 to 168. Default 24. */
                hours?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SummaryResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    withdrawalbundles: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    withdrawalbundles_id: {
        parameters: {
            query?: {
                dataset?: string;
                scope?: string;
                slot?: number;
                kind?: string;
                hash?: string;
                key?: string;
                /** @description Exact instance identity recorded when capturing an observation. */
                instance_id?: string;
                from_height?: number;
                to_height?: number;
                from_time?: string;
                to_time?: string;
                /** @description observation (history default), block (facts default), or ingestion. */
                time_basis?: string;
                q?: string;
                /**
                 * @description History order: `observed` (latest occurrence first) or `block` (block
                 *     height first; unanchored state uses the tip of its first read). Deposits
                 *     default to `block`, other histories to `observed`.
                 */
                order?: string;
                /**
                 * @description History only: omit a reading whose content equals the previous reading
                 *     of the same entity, such as a re-read after a monitor restart.
                 */
                changes?: boolean;
                limit?: number;
                cursor?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProtocolPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    live: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ready: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
}
