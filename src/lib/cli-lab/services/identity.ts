// sts·iam(일부)·ec2(리전/AZ 조회). iam·sts 는 글로벌 서비스라 --region 과 무관하다.
import { callerArn, callerUserId, isoTime, stableId, type IamUser, type SimState } from '../state';
import { REGIONS, zonesFor } from '../regions';
import type { CommandContext, CommandOutcome, ServiceSpec } from '../types';

export const MANAGED_POLICIES: readonly string[] = [
  'AdministratorAccess',
  'ReadOnlyAccess',
  'PowerUserAccess',
  'AmazonS3FullAccess',
  'AmazonS3ReadOnlyAccess',
  'AmazonEC2ReadOnlyAccess',
  'IAMUserChangePassword',
];
const policyArn = (name: string) => `arn:aws:iam::aws:policy/${name}`;

function str(ctx: CommandContext, name: string): string {
  const v = ctx.args[name];
  return typeof v === 'string' ? v : '';
}

function noSuchUser(name: string): CommandOutcome {
  return { kind: 'service-error', code: 'NoSuchEntity', message: `The user with name ${name} cannot be found.` };
}

function userView(u: IamUser) {
  return { Path: '/', UserName: u.userName, UserId: u.userId, Arn: u.arn, CreateDate: isoTime(u.createdAt) };
}

function replaceUser(state: SimState, user: IamUser): SimState {
  return { ...state, users: state.users.map((u) => (u.userName === user.userName ? user : u)) };
}

export const sts: ServiceSpec = {
  global: true,
  operations: {
    'get-caller-identity': {
      apiName: 'GetCallerIdentity',
      params: [],
      run: (ctx) => ({
        kind: 'ok',
        data: { UserId: callerUserId(ctx.state), Account: ctx.state.accountId, Arn: callerArn(ctx.state) },
      }),
    },
  },
};

export const iam: ServiceSpec = {
  global: true,
  operations: {
    'create-user': {
      apiName: 'CreateUser',
      params: [{ name: '--user-name', kind: 'string', required: true }, { name: '--path', kind: 'string' }],
      run: (ctx) => {
        const name = str(ctx, '--user-name');
        if (!/^[\w+=,.@-]{1,64}$/.test(name)) {
          return {
            kind: 'service-error',
            code: 'ValidationError',
            message: `1 validation error detected: Value '${name}' at 'userName' failed to satisfy constraint: Member must satisfy regular expression pattern: [\\w+=,.@-]+`,
          };
        }
        if (ctx.state.users.some((u) => u.userName.toLowerCase() === name.toLowerCase())) {
          return { kind: 'service-error', code: 'EntityAlreadyExists', message: `User with name ${name} already exists.` };
        }
        const user: IamUser = {
          userName: name,
          userId: stableId('AIDA', name),
          arn: `arn:aws:iam::${ctx.state.accountId}:user/${name}`,
          createdAt: ctx.state.clock,
          policyArns: [],
        };
        return { kind: 'ok', state: { ...ctx.state, users: [...ctx.state.users, user] }, data: { User: userView(user) } };
      },
    },
    'list-users': {
      apiName: 'ListUsers',
      params: [],
      run: (ctx) => ({ kind: 'ok', data: { Users: ctx.state.users.map(userView) } }),
    },
    'attach-user-policy': {
      apiName: 'AttachUserPolicy',
      params: [{ name: '--user-name', kind: 'string', required: true }, { name: '--policy-arn', kind: 'string', required: true }],
      run: (ctx) => {
        const name = str(ctx, '--user-name');
        const arn = str(ctx, '--policy-arn');
        const user = ctx.state.users.find((u) => u.userName === name);
        if (!user) return noSuchUser(name);
        if (!/^arn:aws:iam::/.test(arn)) {
          return { kind: 'service-error', code: 'InvalidInput', message: `ARN ${arn} is not valid.` };
        }
        if (!MANAGED_POLICIES.map(policyArn).includes(arn)) {
          return { kind: 'service-error', code: 'NoSuchEntity', message: `Policy ${arn} does not exist or is not attachable.` };
        }
        if (user.policyArns.includes(arn)) return { kind: 'ok' };
        return { kind: 'ok', state: replaceUser(ctx.state, { ...user, policyArns: [...user.policyArns, arn] }) };
      },
    },
    'detach-user-policy': {
      apiName: 'DetachUserPolicy',
      params: [{ name: '--user-name', kind: 'string', required: true }, { name: '--policy-arn', kind: 'string', required: true }],
      run: (ctx) => {
        const name = str(ctx, '--user-name');
        const arn = str(ctx, '--policy-arn');
        const user = ctx.state.users.find((u) => u.userName === name);
        if (!user) return noSuchUser(name);
        if (!user.policyArns.includes(arn)) {
          return { kind: 'service-error', code: 'NoSuchEntity', message: `Policy ${arn} was not found.` };
        }
        return { kind: 'ok', state: replaceUser(ctx.state, { ...user, policyArns: user.policyArns.filter((a) => a !== arn) }) };
      },
    },
    'list-attached-user-policies': {
      apiName: 'ListAttachedUserPolicies',
      params: [{ name: '--user-name', kind: 'string', required: true }],
      run: (ctx) => {
        const name = str(ctx, '--user-name');
        const user = ctx.state.users.find((u) => u.userName === name);
        if (!user) return noSuchUser(name);
        return {
          kind: 'ok',
          data: {
            AttachedPolicies: user.policyArns.map((arn) => ({ PolicyName: arn.split('/').pop(), PolicyArn: arn })),
          },
        };
      },
    },
    'delete-user': {
      apiName: 'DeleteUser',
      params: [{ name: '--user-name', kind: 'string', required: true }],
      run: (ctx) => {
        const name = str(ctx, '--user-name');
        const user = ctx.state.users.find((u) => u.userName === name);
        if (!user) return noSuchUser(name);
        if (user.policyArns.length) {
          return { kind: 'service-error', code: 'DeleteConflict', message: 'Cannot delete entity, must detach all policies first.' };
        }
        return { kind: 'ok', state: { ...ctx.state, users: ctx.state.users.filter((u) => u.userName !== name) } };
      },
    },
  },
};

export const ec2: ServiceSpec = {
  operations: {
    'describe-regions': {
      apiName: 'DescribeRegions',
      params: [{ name: '--region-names', kind: 'list' }, { name: '--all-regions', kind: 'flag' }],
      run: (ctx) => {
        const wanted = ctx.args['--region-names'];
        const names = Array.isArray(wanted) ? wanted : typeof wanted === 'string' ? [wanted] : null;
        const unknown = names?.find((n) => !REGIONS.includes(n));
        if (unknown) {
          return { kind: 'service-error', code: 'InvalidParameterValue', message: `Invalid region names: '[${unknown}]'` };
        }
        const list = names ?? REGIONS;
        return {
          kind: 'ok',
          data: {
            Regions: list.map((r) => ({ OptInStatus: 'opt-in-not-required', RegionName: r, Endpoint: `ec2.${r}.amazonaws.com` })),
          },
        };
      },
    },
    'describe-availability-zones': {
      apiName: 'DescribeAvailabilityZones',
      params: [{ name: '--all-availability-zones', kind: 'flag' }, { name: '--zone-names', kind: 'list' }],
      run: (ctx) => {
        const wanted = ctx.args['--zone-names'];
        const names = Array.isArray(wanted) ? wanted : typeof wanted === 'string' ? [wanted] : null;
        const zones = zonesFor(ctx.region);
        const bad = names?.find((n) => !zones.some((z) => z.ZoneName === n));
        if (bad) {
          return { kind: 'service-error', code: 'InvalidParameterValue', message: `The zone '${bad}' does not exist.` };
        }
        return { kind: 'ok', data: { AvailabilityZones: names ? zones.filter((z) => names.includes(z.ZoneName)) : zones } };
      },
    },
  },
};
