export interface MaintenanceRequest {
  path: string;
}

export interface MaintenanceSample {
  profile: string;
  version: string;
  kind: string;
  confined: boolean;
  bit: string;
  result: string;
  runtime: MaintenanceRequest[];
  publisher: MaintenanceRequest[];
  updates: MaintenanceRequest[];
}

export interface MaintenanceSensor {
  profile: string;
  requests: MaintenanceRequest[];
}

/** Scheduling varies by browser. Keep inactive groups visible while requiring
 * a measured HTTP sensor in every profile and a positive update for each native
 * mechanism somewhere in the tested matrix.
 */
export function maintenanceCoverage(
  samples: readonly MaintenanceSample[],
  sensors: readonly MaintenanceSensor[] = [],
) {
  const profiles = [...new Set(samples.map((sample) => sample.profile))];
  const kinds = [...new Set(samples.map((sample) => sample.kind))];
  const native = samples.filter((sample) => !sample.confined);
  const violations = samples.filter(
    (sample) =>
      sample.confined && (sample.runtime.length > 0 || sample.publisher.length > 0),
  );
  const errors: string[] = [];
  const sensorCoverage = profiles.map((profile) => {
    const explicit = sensors
      .filter((sensor) => sensor.profile === profile)
      .flatMap((sensor) => sensor.requests);
    const observed = native
      .filter((sample) => sample.profile === profile)
      .flatMap((sample) => [...sample.runtime, ...sample.publisher]);
    return {
      profile,
      source: explicit.length
        ? 'uncached native HTTP control'
        : 'captured native operation',
      requests: explicit.length ? explicit : observed,
    };
  });
  const groups = profiles.flatMap((profile) =>
    kinds
      .filter((kind) =>
        native.some((sample) => sample.profile === profile && sample.kind === kind),
      )
      .map((kind) => {
        const actions = native.filter(
          (sample) =>
            sample.profile === profile && sample.kind === kind && sample.bit === '1',
        );
        return {
          profile,
          kind,
          samples: actions.length,
          positiveSamples: actions.filter((sample) => sample.updates.length > 0).length,
        };
      }),
  );
  const mechanisms = [...new Set(native.map((sample) => sample.kind))].map((kind) => ({
    kind,
    profiles: [
      ...new Set(
        native
          .filter(
            (sample) =>
              sample.kind === kind && sample.bit === '1' && sample.updates.length > 0,
          )
          .map((sample) => sample.profile),
      ),
    ],
  }));

  for (const sample of samples) {
    if (sample.result !== (sample.bit === '0' ? 'skipped' : 'ready'))
      errors.push(
        `${sample.profile}/${sample.kind}/${sample.bit}: operation did not complete`,
      );
    if (
      !sample.confined &&
      sample.bit === '0' &&
      (sample.runtime.length || sample.publisher.length)
    )
      errors.push(
        `${sample.profile}/${sample.kind}: no-operation native control transmitted`,
      );
  }
  for (const profile of profiles)
    for (const kind of kinds) {
      for (const confined of kind === 'reload' ? [true] : [false, true]) {
        for (const bit of ['0', '1'])
          if (
            !samples.some(
              (sample) =>
                sample.profile === profile &&
                sample.kind === kind &&
                sample.confined === confined &&
                sample.bit === bit,
            )
          )
            errors.push(
              `${profile}/${kind}/${confined ? 'confined' : 'native'}/${bit}: sample missing`,
            );
      }
    }
  for (const sensor of sensorCoverage)
    if (!sensor.requests.length)
      errors.push(`${sensor.profile}: physical HTTP sensor did not demonstrate traffic`);
  for (const mechanism of mechanisms)
    if (!mechanism.profiles.length)
      errors.push(
        `${mechanism.kind}: native update was not observed in any tested profile`,
      );
  if (!samples.length) errors.push('No observations were recorded');
  if (violations.length)
    errors.push('Confined operations produced physical HTTP traffic');

  return {
    passed: errors.length === 0,
    method:
      'Zero HTTP and successful paired actions in every profile; physical HTTP sensor per profile; positive native maintenance control per mechanism in at least one profile',
    sensorCoverage,
    mechanisms,
    inactiveNativeGroups: groups.filter((group) => !group.positiveSamples),
    nativeGroups: groups,
    violations,
    errors,
  };
}
