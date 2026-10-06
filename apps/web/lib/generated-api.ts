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
        CoverageResponse: {
            branch: components["schemas"]["BranchState"];
            local_status: string;
            meta: components["schemas"]["ResponseMeta"];
            observation_quality: unknown;
            snapshot_history: string;
            streams: components["schemas"]["CoverageScope"][];
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
            /** Format: date-time */
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
        /** @enum {string} */
        SyncMode: "bootstrap" | "catching_up" | "following" | "interrupted" | "incompatible";
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
