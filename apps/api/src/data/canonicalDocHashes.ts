// GENERATED FILE - do not edit by hand.
//
// SHA-256 de cada revisión canónica conocida de los documentos operativos. La migración
// de refresco los usa para distinguir una copia canónica intacta (segura de actualizar)
// de una que un coordinador editó (se deja como está).
//
// Un nombre puede tener varios hashes: el mismo texto se sembró desde fuentes distintas a
// lo largo del tiempo (los diccionarios de datos y las copias literales embebidas en las
// migraciones de backfill AddMissingServiceTeams / AddComprasSacerdotesTeams), y las
// revisiones anteriores se conservan porque en una base vieja puede vivir cualquiera.
//
// Dos grupos porque unos cuantos nombres (Sacerdotes, Compras, Snacks, Transporte, Cuartos,
// Salón) existen a la vez como documento de responsabilidad y como equipo de servicio, con
// contenidos distintos: cruzarlos refrescaría el texto equivocado.
//
// ESTE MÓDULO NO DEBE IMPORTAR NADA: las migraciones lo cargan en producción, donde
// cualquier cadena de imports que llegue a @repo/types muere con "Unknown file extension .ts".
//
// Regenerar con: pnpm --filter api exec vite-node scripts/freeze-canonical-doc-hashes.ts

/** charlaDocumentation + responsibilityDocumentation → responsability_attachment.content, retreat_responsibilities.description */
export const PREVIOUS_DOC_HASHES: Record<string, string[]> = {
	"Biblias": [
		'25647432beb078f8a4a077e1b628ff044de1ee9a0e0519eea5f4a5476786a110',
		'dab5687b502947e7b138801414c1e9aed0b7d1c1af9943dcda72eefe02f629f5',
	],
	"Bolsas": [
		'98bade4014fe60ab953dd90ab2101766b17733568f7f64ee3dfe1f8948b9984d',
		'e305ff0a9d28cf8eb7bc2abdc0e7d4540341c5690ac29a6612916a922a0ac096',
	],
	"Campanero": [
		'4ee5fa5ee1585dddfe3996ce7113a0ace15eeaaf103de2fce845d7a6fe07967f',
		'a38c1c5b8764809148d1b44f6871fbfa55ff8fdd68dfbe37b09e5d8a9b1ff795',
	],
	"Charla: Amando a Dios a través del Servicio": [
		'53f4c4e5a62806a2faf191b8fb583815d9f98804e405d255ab30aa042c10dc2f',
	],
	"Charla: Conocerte a Ti Mismo": [
		'4ed1b2b118309a23b7073984bae230f991f9b43a5d66637c70ba55aa954c8e78',
		'd7677894e6c0d29469899a49e97c06b6a02ab11f745d5942fd74cd0900a41cb8',
	],
	"Charla: Conociendo a Dios a través de la Escrituras": [
		'9197ed936f548b7c945983303d1e21d245032a0bfbbdd8178f0616adf3ffb01e',
	],
	"Charla: Conociendo a Dios a través de la Familia y Amigos": [
		'4bf96c977d72db1eb7ce8dfe84756385089733f2bb094f6f569f071df734f4c7',
	],
	"Charla: Conociendo a Dios a través de la Oración": [
		'd3aef7354749df0798d01956d7790c7bcde32e15906ba6337a28b35651117b10',
	],
	"Charla: Conociendo a Dios a través de los Sacramentos": [
		'2bfc3c24fc9492907b11a8e77fee46630d9c0b6d545cd13bb4936ba0718117e9',
	],
	"Charla: Conociendo a Dios a través del Conocimiento Personal (Las Máscaras)": [
		'1d4363a48faa012e6fc0feff50b1833fccc5bac90cd1691bcf5b8d66c637f3eb',
	],
	"Charla: De la Confianza": [
		'69b54dff1aa0544ded6d888443015b7bdceee415027640f15d05e3fa5503860c',
	],
	"Charla: De la Rosa": [
		'cb6b9a6aa33a813f0985bf4af893428592d81de1ba1cee872fba021aa3df4372',
	],
	"Charla: Las Cargas que Llevamos": [
		'45f486e52abccb3db5d7bb8c1167e821af39da327f318f4b9ce0acdd76ee5d31',
	],
	"Charla: Sanación de los Recuerdos (Sanando Heridas)": [
		'e509e7cae31c0d728c93978a81f6e4454184114e3b7efddef69de583fb5b52dc',
	],
	"Comedor": [
		'0db07b5522a176444336e971631c3a971e341fd54a31af03e85d5dac98185099',
		'f3f71139132666dd277bb0431ba6dc9a5f1543434d3c4aa1aa9f26718d4a8ae6',
	],
	"Compras": [
		'4f2b6a0b88046f0f6192bf210ed76a17a6b4225976cced59bf8d4aab15c0644c',
		'e5574d5a75109a87462bab5f8447c223fafc16a745bf64a9b431e36db4aa9462',
	],
	"Continua": [
		'049a7137994cf8db8e0252817f54af9d6b48395e6376eb13aeb6f6546886d6cc',
		'2cbeeadef3766b74e6f507c6854b70de1fbf5f4e5d3a6a8f6a06f412c58382f3',
	],
	"Cuartos": [
		'2f3915860e0d34e8b1acdc583dfcc66098c8fbe8e6f7fd8ca42e8d4655c391b4',
		'30191dff66d9f25966594c0f9f2a214c10a79b56706260c684e69d8a91f2311b',
	],
	"Despedida": [
		'7478f2e12d6b1f11a2e551d1d47e26fd3a3f8135172c951e3211a21a802b6583',
	],
	"Diario": [
		'724cebbd6ef8158023125cd132abe7539472ec0abcf3094478c2e34d08a3860c',
		'b1c42d40f71ad6628f730d3d622d3892e6cccb0e818c27a6d50f0c2bec2e9d41',
	],
	"Explicación Rosario y entrega": [
		'5f18e89aee13a877ff4d9653df8550f9ed39fa497df503db207611fee8a366cc',
		'6d191d26bf943d7dfb0d69d4f1a39155fdaf11546a5f04e1157cd2aabb4530b4',
	],
	"Inventario": [
		'1f182983b3b228bed0d5375e92a81dc7eeeef4ee7e7de0a2ac81090094d48e25',
		'98cd58aedd3558c6d2096f8c899a2d8699435b947988245c7c89c5741c0796b4',
	],
	"Logistica": [
		'1fe2638003ff784b09ddbeee5e4ebf39802d82ed5c34e8c59afcb43b1c282061',
		'e03c9c8f9ca1dbb259d21feefc763fac1d1c77a71761dc2dd396fb16293445d7',
	],
	"Mantelitos": [
		'39d3dda5880642fe452fc1909b99d75293336a0a362e40700afd17d1b93dd579',
		'f991d924ba74ae6b52b94d752295688044b0a4e7d3c9add6a3ef143dedc1564a',
	],
	"Moderador": [
		'8546b64b3ab3b23ead3edfa9a68793596ca09638913152275ad6d0f3be61c6d2',
		'da0cda28e42dc2ac71e8676f70d70ab4d645207c7c3c2c468b682e4320e07d31',
	],
	"Música": [
		'1744c2873ce8a2748d2a66c5eb40e66f71ac23bbaa56c76167da9a5338cdd8a1',
		'984e06ce67bc347031bc9e77bcb8c038ec3ba6079ffbf329e5aea5cd8269cb83',
	],
	"Oración de Intercesión": [
		'e2d5309b5b8c2d6ab43341921aae441471a29a140a86fc42b0d61f0125e88fb1',
		'e3dd78dcdbf6bafdc0338de296200c4d1a9f9dab5f6c1267f10356fe133243b4',
	],
	"Palanquero 1": [
		'20cfbddb7782713d4b1df20bb472b46dea988b034abed8c49f5587cc5b1e6627',
		'a64265567d8488cd5197217f8aebff7a685cca37e70799da52c04ecf10af8f24',
	],
	"Palanquero 2": [
		'03465d414befc76c4d2d53e95fb4008218e0a7938140494fdddd4e098a8b3de0',
		'7f47382f11b2a3078c3e2a40bb87588f550dadd5cd73d917199bb7319e023695',
	],
	"Palanquero 3": [
		'22db8aa79bd8720de58ff798bd452d4b7c8d7296c8c3ac8261db5212202669cb',
		'6af7dcfd11b8b3d3b8115a0dc7270bc8cf982a7a13181cc5e61f38309238dda8',
	],
	"Palanquitas": [
		'085c8d636363cbcdad3fa25efbb9509e2ed4aeb72c6ed04fc045403b3b2c2303',
		'a76f7af18f99d96d2861dcc7db1628997fae420215371116f6861f2744cee126',
	],
	"Recepción": [
		'ce9a4c7f0b84532fd47c039e54c10c3b45568d3808a567c8014e8121de028667',
		'd2020bc11d73a1fbcca911756904e06a3a469ed4205ccadfad41fc5d26c4432d',
	],
	"Reglamento de la Casa": [
		'2e9d925e66417c9e666c30f0826a76213aed7fbf6a4b9ab9519bfbcdbadafe3a',
		'd9c2aa0ab74ab61f494eb88fa13bdbd739b20e921ae9029f84a33f55c46a494c',
	],
	"Resumen del día": [
		'0b41ca2a7a9c7ec392953e134566e45fc0517fa60dedcf5d1ec178eb97cf6ded',
		'6edc10d83f6ff2d81581574d027ba9bc0baf624b4c54c4fbf0e9e2773eeb0ea3',
	],
	"Sacerdotes": [
		'4141d04a5797180a9ba3c44049fc1a736f6e7118191ea8ce50f52a30317ddce6',
		'b917e055f154449e809445fee4aa4c10d643f5e2a15e38ca23e4a86eeb3f615a',
	],
	"Salón": [
		'0ae2046481ec1faef8faf8ea4bd3d8fc901966407ee5b20a29477377214007b9',
		'2f3915860e0d34e8b1acdc583dfcc66098c8fbe8e6f7fd8ca42e8d4655c391b4',
	],
	"Santísimo": [
		'ad01f4eb8468a7f7a97c26637c616e883ae9924091bfaab83acc1126f0602747',
		'e3dd78dcdbf6bafdc0338de296200c4d1a9f9dab5f6c1267f10356fe133243b4',
	],
	"Snacks": [
		'6271412b636dc6614f9024343b5de057036e8d6d8296b140ebb2e71623695624',
		'e5574d5a75109a87462bab5f8447c223fafc16a745bf64a9b431e36db4aa9462',
	],
	"Tesorero": [
		'93714b897addf02f502e897c2d80ba9b62e901b35e2ebbc8b5c6109dd740e647',
		'cb17f555baeb1d053c5dba6408572609131ad5fa12f49329cf619107f96d8c02',
	],
	"Texto: Carta de Jesús": [
		'51ce25c3a471aa2b6c7037b1e0b4282a67b4b638127316ce1f4eb7d8b80752de',
		'7e545aa08356b22e97ea622024343c7b79be2e573f758207acb466c981271fd5',
	],
	"Texto: Dinámica de la Pared": [
		'4d9c994df2a282fac2fddcb4f9c4315f97fcc1ec2ce79363f51e7ac7b6948856',
	],
	"Texto: Dinámica de Sanación": [
		'877649584cd4fc60cc054024b8488879f3b36696993a12f5bc48c43d478838c2',
		'b983579ce26678b11e1bd5e9a2fcf7589df0a60e36fb6e52c99e59c3ba76d2b4',
	],
	"Texto: Explicación de la Confidencialidad": [
		'1f02a410222ef45aa3b6efe304bfbb3fb7072f874a10fa725c7dd8b3b11ff894',
		'969c28cad0a9bda2f6bbec90fa002ebed1969e0462fac3c99a454ee67334637b',
	],
	"Texto: Explicación de La Palanca": [
		'56fc8812e442bf9a03589ee100bd30c8f21699ef0e5fce51586fb8429c607bf6',
		'5a5f908a745ff64c04935e27ac8391077f78ed601ef9c9db3576dff497433547',
	],
	"Texto: Explicación del Ágape": [
		'3a256f04c005d36beb77c50cda5d58b68bb9222f857b0b4247620253350ce54e',
		'7c886172db089eb028444e0f0281040d78ffc55999e0396cdbbca55ce20ec962',
	],
	"Texto: Explicación del Lema \"Jesucristo Ha Resucitado\"": [
		'7dd9644b255d162bede7dcd5149dd8ab22d828b981494b323f9687d16cf32605',
		'89b9368bb1e9dda8b5a74e3bce83f5b885d59a86adf788fb1f21373d1d4fd1eb',
	],
	"Texto: Lavado de Manos": [
		'bee8ef59bfd1ba0b7e79635dd524256dd0226bd68240816255df769596102047',
	],
	"Texto: Oración al Espíritu Santo": [
		'b37a2aa2f17df7a4b2117e87cf3ede44b453ac8d325bb17dded16dc984da413b',
		'fd4126bbd30a0170992fcb29d54a6f3ab64c17b5ca9b42fd12e10b43edde77a4',
	],
	"Texto: Quema de Pecados": [
		'0b3eaea9eac54a9a76de06d6de0d827c98a8b98ed598d565487b0ae3ab8728dd',
	],
	"Transporte": [
		'9a137a87a2e76e5cc65de663d2770f6ed6a1391f8b382be76ebf894d558aaa6b',
		'd9b52205a0eec11e40b4e39561d3b1d303cde1faf402da860405b868610db54e',
	],
};

/** SERVICE_TEAM_INSTRUCTIONS → service_teams.instructions */
export const PREVIOUS_TEAM_INSTRUCTION_HASHES: Record<string, string[]> = {
	"Bienvenida / Registro": [
		'2186e5fa6f35ec7f26ff60a0d6456a0e6219599e49cacfee35a2255dbca8e9f9',
		'6a80531a32a177c4197a6af3deafafb07e1c6a68c2310e009de2e6611219e7f3',
	],
	"Cocina / Comedor": [
		'38dab4180b02da8df93ea4fdc69fe6d1d1731c859636f8878b6f0093c883fc76',
		'e21c6db01ef8e5c94cc305cfb04a5883a5b57392899406a291ae8b36df546462',
	],
	"Colíder de Mesa (Segundo de Mesa)": [
		'2d4bc17c28cd1dd92e56fddb5201de6b8e6aa4837b51a1bc13e7ed15d8e7383f',
		'd92c2d354306feb04ceaf924f066d4a7c5ea4bae09d47c12ea686a2cb0acfe27',
	],
	"Compras": [
		'a761ea5f36982f439e1706b6dda370300de9c0261b82012f9a17d2a643417ce8',
		'cc35c3b7b501c958cb0f9e3c166b2062c0d125f4117059840869ab1daa37d3eb',
	],
	"Cuartos": [
		'94cf186fd33b4f1732ef98e60a8319727f64c2928855e141fa290fe528e05ad3',
		'b697ed1fb018ff2f1a3f84de0d7a5430491359cecae0b04998715cfe3b2e52df',
	],
	"Dinámica de la Pared": [
		'748a58f7055506297062f5adbb0ed62d9b5454adde3f02cbe648099dc7e00d01',
	],
	"Dinámica de la Rosa": [
		'349fb60e8681a7e0cf3938523a5f9f634aa72e10b47a645a18828eac137e51ed',
	],
	"Dinámica de las Máscaras": [
		'87367921d203dac83154be4a2f1d9dffe8347b85bd7231c739f3c676d3227ef3',
	],
	"Dinámica del Perdón / Clausura": [
		'2c90e8c92d502ca9a06e47214b5784c3ee379e35c0341c058498569894bab02a',
	],
	"Examen de Conciencia / Quema de Pecados": [
		'e139478f1eee3686f41dd3499ed85eacca093a1d1a154b9f1abcf561ccc3839f',
	],
	"Intercesión / Oración": [
		'19b65281283e21fe57256455feed91ca00724f53217510345203208dca1137e0',
		'23bd33d8803e556379d1e22862a12ecf0af6d3d9900a57cc4e73fa338e0a0652',
	],
	"Líder de Mesa (Primero de Mesa)": [
		'a9e9170f55564b998a8c2a247f130fe320ebd6fb19791bb24f14dc249e6b7b76',
		'ddd96970b9262a8b8ce5f2aaf628f9f7b2bb40b33de6b3e25646bcd756cbacee',
	],
	"Limpieza y Orden": [
		'8d694da371a6dfec376947980b1903f27e5168431cda0090db4a0069bb73b87c',
		'ca0c6fa801f316c14c2b323cef471129587973beb2c7f1ad1773fdf2478cd902',
	],
	"Liturgia": [
		'0e83818e682fd531e0dd6015d52ec4f2e48eb59e3bfedf312284dcf97019648c',
		'724473f5ac235949fdc179d9b6a85788fc87acd38d8d1b77d3c0b040b61aebb0',
	],
	"Logística": [
		'055c732f145d64d290dbbc30a800c8df25341c1ef881e7468de958c0b7b77183',
		'aa6757578aa75d9701e0f30c2293f7f538b7b88fccd00eaec26a060f023456da',
	],
	"Música y Alabanza": [
		'6020b2384ea86eab0c5b94835d55f38d46dd4d2df4d94b0c976a4beee5c8a8b8',
		'6fa05f239822ff493abfe2af344c1b5d05fa7e2cf8eae243f04ec28a20dd5986',
	],
	"Oración por Intercesión en Mesa": [
		'00116dd66489da388a196f85b0c86b99d4f72c05002da0e9d75be42aa56a0df2',
		'25a7363c21b194686f1783f24863692ee3bd8ead5e96aab46a5aa41446b1e221',
	],
	"Palancas": [
		'18386b051075d542b2eab094c852197c34687752d8e35e767271bc5ff140468b',
		'81eb8b482fca33a5585577eb6d0ef8097ba01b4d0c76b35b9dd9a0dcd4109754',
	],
	"Reglas del Retiro": [
		'0c2c67b813b2b38d77203bbb2826621fb0fa1dcc2a2736c3d73646a1ff18b016',
		'3c79edab939fa7ed3129ea2956f20763f4ea108aa6fc0ff8fd72fc7d5e5ad719',
	],
	"Rosario en Cadena": [
		'4a97e3f04e886ce1452b6e6cd24b5205bdf9271577e613f40fab3bd62ff6e51a',
		'c4c7dd33cc822b53ef1ab953f30ea561f10483e92286b30cb05928d7e1a1a752',
	],
	"Sacerdotes": [
		'1f7fc071690999417b3abd0a938506b1f5dc9c690495aac1b569890da8d83acc',
		'afb1b6fb9beb6c1a66af133da382f1bc3c4995e07ed19cd359753e63f5ce03fa',
	],
	"Salón": [
		'358b7bee0645e939471df1ccb7b10021b34ec8b0683c82db8018344c85f45cef',
		'4fe7a647277df435595f2153afcde8054332de856216fb8b592dc3312822312d',
	],
	"Sanación de los Recuerdos": [
		'be1665ef009774db4f8795b424af6f3eb89ba7ef7362aa8ffabf2e8f14635ae2',
	],
	"Serenata": [
		'c681d6f669ebd1cc94d3dca530d4469ae2e6faa117383ff6ce0985040003a298',
	],
	"Snacks": [
		'cb5617a577b5ba4b51e113a2414e8a1bf2990783b590db7ea3314bfc1a99cf26',
		'df46d789e81ed5b6e8336054ac7535846124e06a305d69b923fd741c157b802e',
	],
	"Trabajo de Pasillo": [
		'6582bfb576263b23cd603bbb5aad8052ea651da3fd3169b1f04ae9c0d46aacf5',
		'bfb2cded5ca1c2ddfa6c58a5e593047e9404ce557daf98bb5b2c26cac121f0a4',
	],
	"Transporte": [
		'2e8259a39f7376fd07500090694797fd44ad0eaacba8a3067a74c2a2dff76406',
		'ef5d3adb1cb803b355520b054123876801bce076338f4ce23194db7ca4315223',
	],
};
