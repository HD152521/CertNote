// 시뮬레이터가 아는 리전과 가용 영역. 옵트인이 필요 없는 기본 리전만 넣었다.
// 서울·버지니아 북부만 실제 AZ 수를 맞췄고, 나머지는 a·b·c 세 개로 단순화했다.

export const REGIONS: readonly string[] = [
  'ap-south-1',
  'eu-north-1',
  'eu-west-3',
  'eu-west-2',
  'eu-west-1',
  'ap-northeast-3',
  'ap-northeast-2',
  'ap-northeast-1',
  'ca-central-1',
  'sa-east-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'eu-central-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
];

const ZONE_PREFIX: Record<string, string> = {
  'ap-south-1': 'aps1',
  'eu-north-1': 'eun1',
  'eu-west-3': 'euw3',
  'eu-west-2': 'euw2',
  'eu-west-1': 'euw1',
  'ap-northeast-3': 'apne3',
  'ap-northeast-2': 'apne2',
  'ap-northeast-1': 'apne1',
  'ca-central-1': 'cac1',
  'sa-east-1': 'sae1',
  'ap-southeast-1': 'apse1',
  'ap-southeast-2': 'apse2',
  'eu-central-1': 'euc1',
  'us-east-1': 'use1',
  'us-east-2': 'use2',
  'us-west-1': 'usw1',
  'us-west-2': 'usw2',
};

// ZoneName 글자 → ZoneId 번호. ZoneName 은 계정마다 섞이므로 버지니아는 일부러 순서를 어긋나게 둔다.
const ZONE_LAYOUT: Record<string, Array<[string, number]>> = {
  'ap-northeast-2': [['a', 1], ['b', 2], ['c', 3], ['d', 4]],
  'us-east-1': [['a', 6], ['b', 1], ['c', 2], ['d', 4], ['e', 3], ['f', 5]],
};

export function isKnownRegion(region: string): boolean {
  return REGIONS.includes(region);
}

export interface AvailabilityZone {
  State: string;
  OptInStatus: string;
  Messages: never[];
  RegionName: string;
  ZoneName: string;
  ZoneId: string;
  GroupName: string;
  NetworkBorderGroup: string;
  ZoneType: string;
}

export function zonesFor(region: string): AvailabilityZone[] {
  const layout = ZONE_LAYOUT[region] ?? [['a', 1], ['b', 2], ['c', 3]];
  const prefix = ZONE_PREFIX[region] ?? region.replace(/-/g, '');
  return layout.map(([letter, n]) => ({
    State: 'available',
    OptInStatus: 'opt-in-not-required',
    Messages: [],
    RegionName: region,
    ZoneName: `${region}${letter}`,
    ZoneId: `${prefix}-az${n}`,
    GroupName: region,
    NetworkBorderGroup: region,
    ZoneType: 'availability-zone',
  }));
}
