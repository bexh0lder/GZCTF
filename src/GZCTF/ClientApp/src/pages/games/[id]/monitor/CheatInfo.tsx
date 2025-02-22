import dayjs from 'dayjs'
import { FC, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Center,
  ScrollArea,
  Stack,
  Text,
  Title,
  Group,
  Accordion,
  useMantineTheme,
  Box,
  Avatar,
  Badge,
  Input,
  Switch,
  Paper,
  Table,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { mdiCheck, mdiKeyAlert, mdiTarget } from '@mdi/js'
import { Icon } from '@mdi/react'
import WithGameMonitorTab from '@Components/WithGameMonitor'
import { RequireRole } from '@Components/WithRole'
import { ParticipationStatusControl } from '@Components/admin/ParticipationStatusControl'
import { SwitchLabel } from '@Components/admin/SwitchLabel'
import { showErrorNotification } from '@Utils/ApiErrorHandler'
import { ParticipationStatusMap } from '@Utils/Shared'
import { useAccordionStyles, useTableStyles } from '@Utils/ThemeOverride'
import { useUserRole } from '@Utils/useUser'
import api, { CheatInfoModel, ParticipationStatus, Role } from '@Api'

enum CheatType {
  Submit = 'Submit',
  Owned = 'Owned',
}

const CheatTypeMap = new Map([
  [
    CheatType.Submit,
    {
      color: 'orange',
      iconPath: mdiTarget,
    },
  ],
  [
    CheatType.Owned,
    {
      color: 'red',
      iconPath: mdiKeyAlert,
    },
  ],
])

interface CheatSubmissionInfo {
  time?: dayjs.Dayjs
  answer?: string
  user?: string
  challenge?: string
  relatedTeam?: string
  cheatType: CheatType
}

interface CheatTeamInfo {
  name?: string
  avatar?: string | null
  teamId?: number
  status?: ParticipationStatus
  lastSubmitTime?: dayjs.Dayjs
  participateId?: number
  organization?: string | null
  submissionInfo: Set<CheatSubmissionInfo>
}

const ToCheatTeamInfo = (cheatInfo: CheatInfoModel[]) => {
  const cheatTeamInfo = new Map<number, CheatTeamInfo>()
  for (const info of cheatInfo) {
    const { ownedTeam, submitTeam, submission } = info
    if (!ownedTeam || !submitTeam || !submission) continue

    const time = dayjs(submission.time)

    for (const part of [ownedTeam, submitTeam]) {
      if (!cheatTeamInfo.has(part.id ?? -1)) {
        cheatTeamInfo.set(part.id ?? -1, {
          name: part.team?.name,
          avatar: part.team?.avatar,
          teamId: part.team?.id,
          status: part.status,
          participateId: part.id,
          organization: part.organization,
          lastSubmitTime: time,
          submissionInfo: new Set<CheatSubmissionInfo>(),
        })
      }
    }

    const ownedTeamInfo = cheatTeamInfo.get(ownedTeam.id ?? -1)
    const submitTeamInfo = cheatTeamInfo.get(submitTeam.id ?? -1)

    if (!ownedTeamInfo || !submitTeamInfo) continue

    if (ownedTeamInfo.lastSubmitTime?.isBefore(time)) {
      ownedTeamInfo.lastSubmitTime = time
    }

    const cheatSubmissionInfo: CheatSubmissionInfo = {
      time: time,
      answer: submission.answer,
      user: submission.user,
      challenge: submission.challenge,
      cheatType: CheatType.Owned,
      relatedTeam: submitTeam.team?.name,
    }

    ownedTeamInfo.submissionInfo.add(cheatSubmissionInfo)

    if (submitTeamInfo.lastSubmitTime?.isBefore(time)) {
      submitTeamInfo.lastSubmitTime = time
    }

    const cheatSubmissionSourceInfo: CheatSubmissionInfo = {
      ...cheatSubmissionInfo,
      cheatType: CheatType.Submit,
      relatedTeam: ownedTeam.team?.name,
    }

    submitTeamInfo.submissionInfo.add(cheatSubmissionSourceInfo)
  }
  return cheatTeamInfo
}

interface CheatSubmissionInfoProps {
  submissionInfo: CheatSubmissionInfo
}

const CheatSubmissionInfo: FC<CheatSubmissionInfoProps> = (props) => {
  const { submissionInfo } = props
  const theme = useMantineTheme()
  const type = CheatTypeMap.get(submissionInfo.cheatType)!

  return (
    <Group position="apart" w="100%" spacing={0}>
      <Group position="apart" w="60%" pr="2rem">
        <Group position="left">
          <Icon path={type.iconPath} size={1} color={theme.colors[type.color][6]} />
          <Badge size="sm" color="indigo">
            {dayjs(submissionInfo.time).format('MM/DD HH:mm:ss')}
          </Badge>
          <Text lineClamp={1} weight="bold">
            {submissionInfo.relatedTeam}
          </Text>
        </Group>
        <Text size="sm" lineClamp={1} weight="bold">
          {submissionInfo.user}
        </Text>
      </Group>
      <Stack spacing={0} w="40%">
        <Text weight="bold" size="xs" lineClamp={1}>
          {submissionInfo.challenge}
        </Text>
        <Input
          variant="unstyled"
          value={submissionInfo.answer}
          readOnly
          size="xs"
          sx={(theme) => ({
            input: {
              fontFamily: theme.fontFamilyMonospace,
            },
          })}
        />
      </Stack>
    </Group>
  )
}

interface CheatInfoItemProps {
  userRole: Role
  disabled: boolean
  cheatTeamInfo: CheatTeamInfo
  setParticipationStatus: (id: number, status: ParticipationStatus) => Promise<void>
}

const CheatInfoItem: FC<CheatInfoItemProps> = (props) => {
  const { cheatTeamInfo, disabled, userRole, setParticipationStatus } = props
  const theme = useMantineTheme()
  const part = ParticipationStatusMap.get(cheatTeamInfo.status!)!

  return (
    <Accordion.Item value={cheatTeamInfo.participateId!.toString()}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Accordion.Control>
          <Group position="apart">
            <Group position="left">
              <Avatar alt="avatar" src={cheatTeamInfo.avatar}>
                {!cheatTeamInfo.name ? 'T' : cheatTeamInfo.name.slice(0, 1)}
              </Avatar>
              <Stack spacing={0}>
                <Group spacing={4}>
                  <Title order={4} lineClamp={1} weight="bold">
                    {!cheatTeamInfo.name ? '（无名队伍）' : cheatTeamInfo.name}
                  </Title>
                  {cheatTeamInfo?.organization && (
                    <Badge size="sm" variant="outline">
                      {cheatTeamInfo.organization}
                    </Badge>
                  )}
                </Group>
                <Text size="sm" lineClamp={1}>
                  {dayjs(cheatTeamInfo.lastSubmitTime).format('MM/DD HH:mm:ss')}
                </Text>
              </Stack>
            </Group>
            <Box w="6em">
              <Badge color={part.color}>{part.title}</Badge>
            </Box>
          </Group>
        </Accordion.Control>
        {RequireRole(Role.Admin, userRole) && (
          <ParticipationStatusControl
            disabled={disabled}
            participateId={cheatTeamInfo.participateId!}
            status={cheatTeamInfo.status!}
            setParticipationStatus={setParticipationStatus}
            m={`0 ${theme.spacing.xl}`}
            miw={theme.spacing.xl}
          />
        )}
      </Box>
      <Accordion.Panel>
        <Stack spacing="sm">
          {[...cheatTeamInfo.submissionInfo]
            .sort((a, b) => (b.time?.unix() ?? 0) - (a.time?.unix() ?? 0))
            .map((submissionInfo) => (
              <CheatSubmissionInfo
                key={submissionInfo.time?.unix()}
                submissionInfo={submissionInfo}
              />
            ))}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  )
}

interface CheatInfoTeamViewProps {
  disabled: boolean
  cheatTeamInfo: Map<number, CheatTeamInfo>
  setParticipationStatus: (id: number, status: ParticipationStatus) => Promise<void>
}

const CheatInfoTeamView: FC<CheatInfoTeamViewProps> = (props) => {
  const { role } = useUserRole()
  const { classes } = useAccordionStyles()
  const { cheatTeamInfo, disabled, setParticipationStatus } = props

  return (
    <ScrollArea offsetScrollbars h="calc(100vh - 180px)">
      <Stack spacing="xs" w="100%">
        {!cheatTeamInfo || cheatTeamInfo?.size === 0 ? (
          <Center h="calc(100vh - 200px)">
            <Stack spacing={0}>
              <Title order={2}>暂时没有队伍作弊信息</Title>
              <Text>看起来大家都很老实呢</Text>
            </Stack>
          </Center>
        ) : (
          <Accordion
            multiple
            variant="contained"
            chevronPosition="left"
            classNames={classes}
            className={classes.root}
          >
            {[...cheatTeamInfo.values()]
              .sort((a, b) => (b.lastSubmitTime?.unix() ?? 0) - (a.lastSubmitTime?.unix() ?? 0))
              .map((cheatInfo) => (
                <CheatInfoItem
                  key={cheatInfo.participateId}
                  userRole={role ?? Role.User}
                  cheatTeamInfo={cheatInfo}
                  disabled={disabled}
                  setParticipationStatus={setParticipationStatus}
                />
              ))}
          </Accordion>
        )}
      </Stack>
    </ScrollArea>
  )
}

interface CheatInfoTableViewProps {
  cheatInfo: CheatInfoModel[]
}

const CheatInfoTableView: FC<CheatInfoTableViewProps> = (props) => {
  const { classes, cx, theme } = useTableStyles()

  const rows = props.cheatInfo
    .sort(
      (a, b) => (dayjs(b.submission?.time).unix() ?? 0) - (dayjs(a.submission?.time).unix() ?? 0)
    )
    .map((item, i) => (
      <tr key={`${item.submission?.time}@${i}`}>
        <td className={cx(classes.mono)}>
          <Badge size="sm" color="indigo">
            {dayjs(item.submission?.time).format('MM/DD HH:mm:ss')}
          </Badge>
        </td>
        <td>
          <Text size="sm" weight="bold">
            {item.ownedTeam?.team?.name ?? 'Team'}
          </Text>
        </td>
        <td>
          <Badge size="sm" color="orange">
            {`>>>`}
          </Badge>
        </td>
        <td>
          <Text size="sm" weight="bold">
            {item.submitTeam?.team?.name ?? 'Team'}
          </Text>
        </td>
        <td>
          <Text ff={theme.fontFamilyMonospace} size="sm" weight="bold">
            {item.submission?.user ?? 'User'}
          </Text>
        </td>
        <td>{item.submission?.challenge ?? 'Challenge'}</td>
        <td
          style={{
            width: '36vw',
            maxWidth: '100%',
            padding: 0,
          }}
        >
          <Input
            variant="unstyled"
            value={item.submission?.answer}
            readOnly
            size="sm"
            sx={(theme) => ({
              input: {
                fontFamily: theme.fontFamilyMonospace,
              },
              wrapper: {
                width: '100%',
              },
            })}
          />
        </td>
      </tr>
    ))

  return (
    <Paper shadow="md" p="md">
      <ScrollArea offsetScrollbars h="calc(100vh - 200px)">
        <Table className={classes.table}>
          <thead>
            <tr>
              <th style={{ width: '8rem' }}>时间</th>
              <th style={{ minWidth: '5rem' }}>原始队伍</th>
              <th />
              <th style={{ minWidth: '5rem' }}>提交队伍</th>
              <th style={{ minWidth: '5rem' }}>提交用户</th>
              <th style={{ minWidth: '3rem' }}>题目</th>
              <th className={cx(classes.mono)}>flag</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </Table>
      </ScrollArea>
    </Paper>
  )
}

const CheatInfo: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')

  const { data: cheatInfo } = api.game.useGameCheatInfo(numId, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })

  const [disabled, setDisabled] = useState(false)
  const [cheatTeamInfo, setCheatTeamInfo] = useState<Map<number, CheatTeamInfo>>()
  const [teamView, setTeamView] = useLocalStorage({
    key: 'cheat-info-team-view',
    defaultValue: true,
    getInitialValueInEffect: false,
  })

  useEffect(() => {
    if (!cheatInfo) return

    setCheatTeamInfo(ToCheatTeamInfo(cheatInfo))
  }, [cheatInfo])

  const setParticipationStatus = async (id: number, status: ParticipationStatus) => {
    setDisabled(true)
    try {
      await api.admin.adminParticipation(id, status)
      cheatTeamInfo &&
        setCheatTeamInfo(
          cheatTeamInfo.set(id, {
            ...cheatTeamInfo.get(id)!,
            status,
          })
        )
      showNotification({
        color: 'teal',
        title: '操作成功',
        message: '参与状态已更新',
        icon: <Icon path={mdiCheck} size={1} />,
      })
    } catch (err: any) {
      showErrorNotification(err)
    } finally {
      setDisabled(false)
    }
  }

  return (
    <WithGameMonitorTab>
      <Group position="apart" w="100%">
        <Switch
          label={SwitchLabel('队伍视图', '使用队伍视图展示作弊信息')}
          checked={teamView}
          onChange={(e) => setTeamView(e.currentTarget.checked)}
        />
      </Group>
      {teamView ? (
        <CheatInfoTeamView
          disabled={disabled}
          cheatTeamInfo={cheatTeamInfo ?? new Map()}
          setParticipationStatus={setParticipationStatus}
        />
      ) : (
        <CheatInfoTableView cheatInfo={cheatInfo ?? []} />
      )}
    </WithGameMonitorTab>
  )
}

export default CheatInfo
