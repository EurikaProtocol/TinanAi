import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deploymentsForAccount,
  readLocalDeployments,
  writeLocalDeployment,
  type LaunchpadDeployment,
  type LocalDeploymentRead,
} from './launchpad-deployment';

const EMPTY: LocalDeploymentRead = { records: [], error: null };
const CHANGE_EVENT = 'tinanai:launchpad-deployments-changed';

export function useLaunchpadDeploymentStore(account: string | null) {
  const [state, setState] = useState<LocalDeploymentRead>(EMPTY);

  const reload = useCallback(() => {
    try {
      setState(readLocalDeployments(window.localStorage));
    } catch {
      setState({ records: [], error: 'Browser storage is unavailable. Deployment history cannot be loaded.' });
    }
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener('storage', reload);
    window.addEventListener(CHANGE_EVENT, reload);
    return () => {
      window.removeEventListener('storage', reload);
      window.removeEventListener(CHANGE_EVENT, reload);
    };
  }, [reload]);

  const upsert = useCallback((record: LaunchpadDeployment) => {
    let result: LocalDeploymentRead;
    try {
      result = writeLocalDeployment(record, window.localStorage);
    } catch {
      result = { records: [], error: 'Browser storage is unavailable. Deployment history cannot be saved.' };
    }
    setState(result);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return result;
  }, []);

  const records = useMemo(
    () => deploymentsForAccount(state.records, account),
    [state.records, account],
  );

  return { records, allRecords: state.records, error: state.error, reload, upsert };
}
